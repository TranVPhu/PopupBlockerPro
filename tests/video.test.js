// Tự bấm "Bỏ qua quảng cáo" chỉ với nút của các trình phát đã biết, không bấm nhầm nút lạ trên trang
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <button class="vjs-skip-button" id="known-vjs">Skip</button>
    <button class="videoAdUiSkipButton" id="known-ima">Skip</button>
    <button class="jw-skip" id="known-jw">Skip</button>
    <button class="promo-skip-ad-link" id="unknown">Bỏ qua quảng cáo này, mua ngay</button>
    <button class="skip-ad-and-buy" id="unknown2">Mua ngay</button>
    <script>
        window.__clicked = [];
        document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => window.__clicked.push(b.id)));
    </script>`;

runTest(async () => {
    const server = http.createServer((_, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(PAGE);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;
    const { ctx, sw, swWarnings } = await launchExtension();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/');
    await page.waitForLoadState('load');

    const clicked = () => page.evaluate(() => window.__clicked.slice().sort().join());
    await eventually(async () => (await clicked()).includes('known-jw'));
    await page.waitForTimeout(1500);
    check('known player skip buttons are clicked', (await clicked()) === 'known-ima,known-jw,known-vjs', await clicked());
    check('unknown "skip-ad" lookalike buttons are not clicked', !(await clicked()).includes('unknown'), await clicked());

    // Trang đã tin cậy thì không bấm gì cả
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: [...r.whitelist, 'localhost'] })));
    await eventually(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).flatMap((r) => r.condition.requestDomains || []).includes('localhost')));
    await page.goto(base + '/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);
    check('nothing is clicked on a trusted site', (await clicked()) === '', await clicked());

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
