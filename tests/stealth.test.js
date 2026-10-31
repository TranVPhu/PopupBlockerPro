// Bộ lọc CSS phải bền trước trang web: không gỡ được, không ghi đè được, và trang khó nhận biết extension
const http = require('http');
const { launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <style>#fight { display: block !important; }</style>
    <div class="ad-banner" id="ad">quảng cáo</div>
    <div class="ad-banner" id="fight">quảng cáo chống ẩn</div>
    <div id="content">nội dung</div>`;

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
    const display = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).display, id);

    await page.goto(base + '/');
    await page.waitForTimeout(600);

    check('ad hidden', (await display('ad')) === 'none');
    check('normal content visible', (await display('content')) === 'block');
    check('no style element left for page to find', await page.evaluate(() => !document.getElementById('pb-cosmetic-style')));
    check('page !important cannot override filter', (await display('fight')) === 'none');
    await page.evaluate(() => { document.getElementById('ad').style.setProperty('display', 'block', 'important'); });
    check('inline !important cannot override filter', (await display('ad')) === 'none');
    check('removing every stylesheet does not bring ad back', await page.evaluate(() => {
        document.querySelectorAll('style, link[rel=stylesheet]').forEach((n) => n.remove());
        return getComputedStyle(document.getElementById('fight')).display === 'none';
    }));

    check('hooked functions look native', await page.evaluate(() => {
        const native = (f) => /native code/.test(Function.prototype.toString.call(f));
        const frameGetter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
        return native(window.open) && native(HTMLElement.prototype.click) && native(frameGetter);
    }));
    check('open keeps name and arity', await page.evaluate(() => window.open.name === 'open' && window.open.length === 0));

    // Iframe rỗng cũng được lọc
    check('filter applies inside about:blank frame', await page.evaluate(async () => {
        const f = document.createElement('iframe');
        document.body.appendChild(f);
        const d = f.contentDocument;
        d.body.innerHTML = '<div class="ad-banner" id="x">ad</div>';
        await new Promise((r) => setTimeout(r, 700));
        return f.contentWindow.getComputedStyle(d.getElementById('x')).display === 'none';
    }));

    // Bật/tắt phải áp dụng ngay, và lệnh gỡ CSS phải khớp nội dung đã chèn
    await page.goto(base + '/');
    await page.waitForTimeout(500);
    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'localhost', minutes: 30 });
    await page.waitForTimeout(500);
    check('pausing removes filter without reload', (await display('ad')) === 'block');
    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'localhost', minutes: 0 });
    await page.waitForTimeout(500);
    check('resuming restores filter without reload', (await display('ad')) === 'none');

    // Phần tử người dùng tự ẩn cũng phải lên kịp, và gỡ được
    await sw.evaluate(() => chrome.storage.local.set({ customHidden: { localhost: ['#content'] } }));
    await page.waitForTimeout(500);
    check('custom hidden element applied live', (await display('content')) === 'none');
    await sw.evaluate(() => chrome.storage.local.set({ customHidden: {} }));
    await page.waitForTimeout(500);
    check('custom hidden element removed live', (await display('content')) === 'block');
    check('ad stays hidden after custom rule removed', (await display('ad')) === 'none');
    check('still no style element after updates', await page.evaluate(() => !document.getElementById('pb-cosmetic-style')));

    // Tắt toàn hệ thống
    await sw.evaluate(() => chrome.storage.local.set({ enabled: false }));
    await page.waitForTimeout(500);
    check('global off removes filter', (await display('ad')) === 'block');
    await sw.evaluate(() => chrome.storage.local.set({ enabled: true }));
    await page.waitForTimeout(500);
    check('global on restores filter', (await display('ad')) === 'none');

    // Hàm bọc vẫn chạy đúng
    check('guarded click still works on non-link', await page.evaluate(() => {
        let clicked = false;
        const b = document.createElement('button');
        b.onclick = () => { clicked = true; };
        document.body.appendChild(b);
        b.click();
        return clicked;
    }));
    check('synthetic click on file input still reaches page', await page.evaluate(() => {
        let clicked = false;
        const i = document.createElement('input');
        i.type = 'file';
        i.addEventListener('click', (e) => { clicked = !e.defaultPrevented; e.preventDefault(); });
        document.body.appendChild(i);
        i.click();
        return clicked;
    }));

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
