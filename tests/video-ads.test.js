// Quảng cáo video được phát nhanh cho xong chứ không tua thẳng tới cuối: trình phát dùng MediaSource (YouTube) chưa tải
// phần cuối nên video đứng im ở đó và kẹt luôn ở màn hình quảng cáo. Hết quảng cáo phải trả lại tốc độ & âm thanh ngay
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

// WAV im lặng 20 giây: đủ để trình duyệt biết thời lượng (đoạn code cũ sẽ tua tới đó)
function silentWav(seconds) {
    const rate = 8000;
    const data = rate * seconds;
    const buf = Buffer.alloc(44 + data, 0x80);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
    buf.write('data', 36); buf.writeUInt32LE(data, 40);
    return buf;
}

// Đồng hồ đổi chữ mỗi 100ms giống bộ đếm thời gian của trình phát: trang không lúc nào ngừng thay đổi
const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <div id="movie_player" class="html5-video-player">
        <video id="v" src="/ad.wav" preload="auto"></video>
        <span id="clock"></span>
    </div>
    <script>
        window.__seeks = 0;
        const v = document.getElementById('v');
        v.addEventListener('seeking', () => window.__seeks++);
        v.playbackRate = 1.5; // Tốc độ người dùng đã chọn cho video chính
        setInterval(() => { document.getElementById('clock').textContent = Date.now(); }, 100);
    </script>`;

runTest(async () => {
    const wav = silentWav(20);
    const server = http.createServer((req, res) => {
        if (req.url === '/ad.wav') {
            res.setHeader('content-type', 'audio/wav');
            return res.end(wav);
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(PAGE);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;
    const { ctx, swWarnings } = await launchExtension();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/');
    await page.waitForLoadState('load');
    await eventually(() => page.evaluate(() => document.getElementById('v').duration === 20));

    const state = () => page.evaluate(() => {
        const v = document.getElementById('v');
        return { rate: v.playbackRate, muted: v.muted, time: v.currentTime, seeks: window.__seeks };
    });

    await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing', 'ad-interrupting'));
    const sped = await eventually(async () => (await state()).rate === 16, 5000);
    const during = await state();
    check('ad plays fast and muted even while the page keeps changing', sped && during.muted, JSON.stringify(during));
    check('ad is not seeked to its end', during.seeks === 0 && during.time < 20, JSON.stringify(during));

    await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing', 'ad-interrupting'));
    await page.waitForTimeout(50); // Ngắn hơn chu kỳ quét: phải trả lại ngay khi trình phát bỏ class quảng cáo
    const after = await state();
    check('speed and sound are restored as soon as the ad ends', after.rate === 1.5 && !after.muted, JSON.stringify(after));

    // Quảng cáo thứ hai trên cùng thẻ <video> (YouTube dùng chung cho quảng cáo & video chính)
    await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
    check('a later ad on the same video is sped up too', await eventually(async () => (await state()).rate === 16, 5000), JSON.stringify(await state()));
    await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
    await page.waitForTimeout(50);
    check('restored again after the later ad', (await state()).rate === 1.5, JSON.stringify(await state()));

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
