// Kiểm tra logic ẩn hộp thoại chống chặn quảng cáo trên các trang mẫu, gồm cả các trường hợp KHÔNG được ẩn
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

const FILLER = '<div style="height:5000px">nội dung</div>';
const PAGES = {
    // Gắn vào sau khi tải, như ReactModal: portal -> overlay fixed -> content absolute
    '/react': `<body class="locked"><style>.locked{overflow:hidden}</style>${FILLER}<script>
        setTimeout(() => {
            const p = document.createElement('div'); p.className = 'portal'; document.body.appendChild(p);
            p.innerHTML = '<div id="dlg" style="position:fixed;inset:0;background:rgba(0,0,0,.7)"><div style="position:absolute;top:30%"><h2>Vui lòng cho phép hiện quảng cáo</h2><p>Có vẻ như bạn đang dùng một trình chặn quảng cáo.</p></div></div>';
        }, 500);
    </script>`,
    // Hiện sau khi cuộn trang
    '/scroll': `<body>${FILLER}<script>
        addEventListener('scroll', () => {
            if (document.getElementById('dlg')) return;
            const d = document.createElement('div'); d.id = 'dlg'; d.style.cssText = 'position:fixed;inset:20%;background:#fff';
            d.textContent = 'Please disable your AdBlock to continue'; document.body.appendChild(d);
        });
    </script>`,
    // Có sẵn trong HTML
    '/ssr': `<body>${FILLER}<div id="dlg" style="position:fixed;inset:20%;background:#fff">Hãy tắt chặn quảng cáo</div>`,
    // Render sẵn nhưng ẩn, sau đó mới hiện lên
    '/preRendered': `<body>${FILLER}<div id="dlg" style="display:none;position:fixed;inset:20%;background:#fff">You are using an ad blocker</div>
        <script>setTimeout(() => { document.getElementById('dlg').style.display = 'block'; }, 500);</script>`,
    // Lớp nền tách rời, kiểu Bootstrap
    '/backdrop': `<body>${FILLER}<div id="bd" style="position:fixed;inset:0;background:rgba(0,0,0,.5)"></div><div id="dlg" style="position:fixed;inset:20%;background:#fff">Ad-blocker detected</div>`,

    // <dialog> mở bằng showModal() khóa cả trang: ẩn bằng CSS thôi thì không bấm được gì nữa (sofaflix).
    // React chèn hộp thoại trước, gọi showModal() sau trong useEffect
    '/modalDialog': `<body><button id="search" onclick="window.clicked=1">Tìm kiếm</button>${FILLER}<script>
        setTimeout(() => {
            const d = document.createElement('dialog'); d.id = 'dlg';
            d.innerHTML = 'Khi web bị chặn, hãy vào trang dự phòng. Đừng quên tắt Adblock ủng hộ server nhé! <button>Đã hiểu</button>';
            document.body.appendChild(d);
            setTimeout(() => { d.showModal(); window.shown = 1; }, 200);
        }, 300);
    </script>`,
    // Chèn và mở cùng lúc
    '/modalDialogNow': `<body><button id="search" onclick="window.clicked=1">Tìm kiếm</button>${FILLER}<script>
        setTimeout(() => {
            const d = document.createElement('dialog'); d.id = 'dlg'; d.textContent = 'Please disable your AdBlock to continue';
            document.body.appendChild(d); d.showModal(); window.shown = 1;
        }, 300);
    </script>`,
    // Popup quảng cáo dạng <dialog> người dùng đã tự ẩn bằng menu chuột phải (bộ lọc riêng của trang)
    '/adDialog': `<body><button id="search" onclick="window.clicked=1">Tìm kiếm</button>${FILLER}<script>
        setTimeout(() => {
            const d = document.createElement('dialog'); d.id = 'ad'; d.textContent = 'Quảng cáo nhà cái';
            document.body.appendChild(d); d.showModal(); window.shown = 1;
        }, 300);
    </script>`,

    // Nút nổi nhỏ kiểu vnexpress: ẩn nhưng không đụng tới cuộn trang
    '/smallBtn': `<body>${FILLER}<a id="dlg" href="#" style="position:fixed;bottom:0;right:0;width:150px;height:40px">Hướng dẫn tắt Adblock</a>`,

    // === Các trường hợp KHÔNG được ẩn ===
    '/article': `<body><article id="keep">Bài viết: trình chặn quảng cáo là gì? Cách dùng ad blocker hiệu quả.</article>${FILLER}`,
    '/fixedApp': `<body><div id="keep" style="position:fixed;inset:0;overflow:auto;background:#fff">Bài viết về ad blocker. ${'Nội dung dài. '.repeat(200)}</div>`,
    '/normalModal': `<body>${FILLER}<div id="keep" style="position:fixed;inset:20%;background:#fff">Đăng ký nhận bản tin của chúng tôi</div>`,
    '/roadblock': `<body>${FILLER}<div id="keep" style="position:fixed;inset:20%;background:#fff">Road block ahead, please wait</div>`,
    '/banner': `<body>${FILLER}<div id="keep" style="position:fixed;bottom:0;left:0;right:0;background:#fff">Quảng cáo: mua ngay hôm nay</div>`
};

runTest(async () => {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><meta charset="utf-8"><title>t</title>' + (PAGES[req.url] || ''));
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;
    const { ctx, sw } = await launchExtension();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const visible = (sel) => page.isVisible(sel);
    // Phải tồn tại rồi mới ẩn, nếu không trang chưa kịp tạo hộp thoại cũng bị tính là đạt
    const hiddenOnceExists = (sel) => eventually(async () => (await page.locator(sel).count()) > 0 && !(await visible(sel)));

    await page.goto(base + '/react');
    check('react portal modal hidden', await hiddenOnceExists('#dlg'));
    const scrolled = await eventually(async () => {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(100);
        return (await page.evaluate(() => scrollY)) > 0;
    });
    check('scroll unlocked after hiding', scrolled, 'scrollY=' + await page.evaluate(() => scrollY));

    await page.goto(base + '/scroll');
    await page.waitForLoadState('load');
    const modalCreated = await eventually(async () => {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(100);
        return (await page.locator('#dlg').count()) === 1;
    });
    check('modal shown on scroll hidden', modalCreated && await hiddenOnceExists('#dlg'));

    await page.goto(base + '/ssr');
    check('server-rendered modal hidden', await hiddenOnceExists('#dlg'));
    // Số trên icon: Chrome không đếm gì ở trang này nên chỉ còn lượt ẩn hộp thoại
    const badge = () => sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'http://localhost/*' });
        return chrome.action.getBadgeText({ tabId: tab.id });
    });
    check('hidden modal is counted', await eventually(async () => Number(await badge()) >= 1), 'badge=' + await badge());

    await page.goto(base + '/preRendered');
    await page.waitForFunction(() => document.getElementById('dlg').style.display === 'block', null, { polling: 100 });
    check('pre-rendered modal stays hidden when shown', await hiddenOnceExists('#dlg'));

    await page.goto(base + '/backdrop');
    check('detached backdrop hidden', await hiddenOnceExists('#dlg') && await hiddenOnceExists('#bd'));

    await page.goto(base + '/smallBtn');
    check('small nag button hidden', await hiddenOnceExists('#dlg'));
    check('small button does not touch scroll', !(await page.evaluate(() => document.documentElement.hasAttribute('data-pb-unlock'))));

    // Hộp thoại modal bị ẩn phải được đóng hẳn, nếu không phần còn lại của trang vẫn bị khóa
    const pageUsable = async (dialogSel) => {
        await page.waitForFunction(() => window.shown === 1, null, { polling: 50 });
        const released = await eventually(() => page.evaluate((sel) => {
            const d = document.querySelector(sel);
            return !!d && !d.open && !d.matches(':modal');
        }, dialogSel));
        let clicked = false;
        try {
            await page.click('#search', { timeout: 3000 });
            clicked = await page.evaluate(() => window.clicked === 1);
        } catch (_) { }
        return { released, clicked };
    };
    for (const p of ['/modalDialog', '/modalDialogNow']) {
        await page.goto(base + p);
        await page.waitForFunction(() => window.shown === 1, null, { polling: 50 });
        check(`modal <dialog> hidden: ${p}`, await hiddenOnceExists('#dlg'));
        const { released, clicked } = await pageUsable('#dlg');
        check(`hidden modal <dialog> closed: ${p}`, released);
        check(`page clickable after hiding modal <dialog>: ${p}`, clicked);
    }

    await sw.evaluate(() => chrome.storage.local.set({ customHidden: { localhost: ['#ad'] } }));
    await page.goto(base + '/adDialog');
    await page.waitForFunction(() => window.shown === 1, null, { polling: 50 });
    check('user-hidden ad <dialog> hidden', await hiddenOnceExists('#ad'));
    const adDialog = await pageUsable('#ad');
    check('user-hidden modal <dialog> closed', adDialog.released);
    check('page clickable after user hides modal <dialog>', adDialog.clicked);
    await sw.evaluate(() => chrome.storage.local.remove('customHidden'));

    for (const p of ['/article', '/fixedApp', '/normalModal', '/roadblock', '/banner']) {
        await page.goto(base + p);
        await page.waitForTimeout(500);
        check(`NOT hidden: ${p}`, await visible('#keep'));
        check(`no scroll lock change: ${p}`, !(await page.evaluate(() => document.documentElement.hasAttribute('data-pb-unlock'))));
    }

    // Thêm trang vào whitelist -> không ẩn
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: [...r.whitelist, 'localhost'] })));
    await page.goto(base + '/ssr');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    check('whitelisted site keeps modal', await visible('#dlg'));
    check('whitelisted site counts nothing', !Number(await badge()), 'badge=' + await badge());

    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
    server.close();
    finish();
});
