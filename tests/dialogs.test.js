// Kiểm tra logic ẩn hộp thoại chống chặn quảng cáo trên các trang mẫu, gồm cả các trường hợp KHÔNG được ẩn
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EXT_DIR, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

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
    const { ctx, sw, extId, swWarnings } = await launchExtension();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const visible = (sel) => page.isVisible(sel);

    await page.goto(base + '/react');
    await page.waitForTimeout(1000);
    check('react portal modal hidden', !(await visible('#dlg')));
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(300);
    check('scroll unlocked after hiding', (await page.evaluate(() => scrollY)) > 0, 'scrollY=' + await page.evaluate(() => scrollY));

    await page.goto(base + '/scroll');
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(500);
    check('modal shown on scroll hidden', (await page.locator('#dlg').count()) === 1 && !(await visible('#dlg')));

    await page.goto(base + '/ssr');
    await page.waitForTimeout(500);
    check('server-rendered modal hidden', !(await visible('#dlg')));

    await page.goto(base + '/preRendered');
    await page.waitForTimeout(1000);
    check('pre-rendered modal stays hidden when shown', !(await visible('#dlg')));

    await page.goto(base + '/backdrop');
    await page.waitForTimeout(600);
    check('detached backdrop hidden', !(await visible('#dlg')) && !(await visible('#bd')));

    await page.goto(base + '/smallBtn');
    await page.waitForTimeout(500);
    check('small nag button hidden', !(await visible('#dlg')));
    check('small button does not touch scroll', !(await page.evaluate(() => document.documentElement.hasAttribute('data-pb-unlock'))));

    for (const p of ['/article', '/fixedApp', '/normalModal', '/roadblock', '/banner']) {
        await page.goto(base + p);
        await page.waitForTimeout(500);
        check(`NOT hidden: ${p}`, await visible('#keep'));
        check(`no scroll lock change: ${p}`, !(await page.evaluate(() => document.documentElement.hasAttribute('data-pb-unlock'))));
    }

    // Thêm trang vào whitelist -> không ẩn
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: [...r.whitelist, 'localhost'] })));
    await page.waitForTimeout(300);
    await page.goto(base + '/ssr');
    await page.waitForTimeout(500);
    check('whitelisted site keeps modal', await visible('#dlg'));

    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
    server.close();
    finish();
});
