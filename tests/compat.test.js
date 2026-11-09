// Trang hợp lệ hay bọc window.open và HTMLElement.prototype.click (viết lại URL, đo lường...).
// Phép gán ở chế độ strict mà ném lỗi sẽ dừng cả ứng dụng của trang, nên extension phải nhận phép gán nhưng vẫn giữ bảo vệ.
const http = require('http');
const { launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

// Giống console BytePlus: bọc bằng Proxy rồi gán lại ở chế độ strict, mã chạy sau đó phải được thực thi
const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <button id="open">mở</button>
    <a id="blank" href="http://example.org/blank" target="_blank">link</a>
    <script>
        'use strict';
        window.__r = { openCalls: 0, clickCalls: 0 };
        try {
            window.open = new Proxy(window.open, {
                apply(target, thisArg, args) {
                    window.__r.openCalls++;
                    return Reflect.apply(target, thisArg, args);
                }
            });
            window.__r.assignOpen = 'ok';
        } catch (e) { window.__r.assignOpen = e.message; }
        try {
            const nativeClick = HTMLElement.prototype.click;
            HTMLElement.prototype.click = function () { window.__r.clickCalls++; return nativeClick.call(this); };
            window.__r.assignClick = 'ok';
        } catch (e) { window.__r.assignClick = e.message; }
    </script>
    <script>
        'use strict';
        window.__r.laterScriptRan = true;
        document.getElementById('open').addEventListener('click', () => { window.open('/after'); });
    </script>`;

runTest(async () => {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(req.url === '/after' ? '<!doctype html><title>after</title>after' : PAGE);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;
    const { ctx, swWarnings } = await launchExtension({ resolveTo: `127.0.0.1:${server.address().port}` });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let tabsCreated = 0;
    ctx.on('page', () => { tabsCreated++; });
    await page.goto(base + '/');
    await page.waitForLoadState('load');

    // page.evaluate của Playwright giả lập thao tác người dùng nên không dùng được ở đây: gọi qua CDP với userGesture: false.
    // Thao tác thật (page.click) để sau cùng, vì nó cấp quyền kích hoạt trong vài giây
    const cdp = await ctx.newCDPSession(page);
    const ev = async (expression) => {
        const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, userGesture: false, returnByValue: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception ? exceptionDetails.exception.description : exceptionDetails.text);
        return result.value;
    };
    const isDummy = (call) => ev(`(() => { const w = ${call}; try { return w.location.href === ''; } catch (_) { return false; } })()`);

    const state = await ev('window.__r');
    check('assigning window.open is accepted', state.assignOpen === 'ok', state.assignOpen);
    check('assigning HTMLElement.prototype.click is accepted', state.assignClick === 'ok', state.assignClick);
    check('script after the assignment still runs', state.laterScriptRan === true);
    check('no page errors', errors.length === 0, errors.join(' | '));
    check('window.open keeps a stable identity', await ev('window.open === window.open'));

    // Chưa có thao tác của người dùng: bảo vệ vẫn chặn dù đã có lớp bọc của trang
    const tabsBefore = tabsCreated;
    const callsBefore = (await ev('window.__r')).openCalls;
    check('guard still blocks a popup without user action', await isDummy("window.open('http://example.org/ad')"));
    check('the page wrapper ran first', (await ev('window.__r')).openCalls === callsBefore + 1);

    // Qua iframe cũng không lách được, kể cả khi truy cập contentWindow nhiều lần
    check('iframe window.open still blocked, repeated access is safe', await isDummy(`(() => {
        const f = document.createElement('iframe');
        document.body.appendChild(f);
        for (let i = 0; i < 200; i++) f.contentWindow;
        return f.contentWindow.open('http://example.org/frame');
    })()`));

    // click() bọc bởi trang: lệnh click giả lập vào link mở tab mới vẫn bị chặn
    const clicksBefore = (await ev('window.__r')).clickCalls;
    await ev("document.getElementById('blank').click()");
    await page.waitForTimeout(1500);
    check('page click wrapper ran', (await ev('window.__r')).clickCalls === clicksBefore + 1);
    check('synthetic click on _blank link still blocked', tabsCreated === tabsBefore, `${tabsCreated - tabsBefore} new tabs`);

    // Trang thay hẳn window.open bằng hàm của riêng mình thì hàm đó được dùng
    check('page can replace window.open with its own function', await ev("(() => { const old = window.open; window.open = () => 'custom'; const ok = window.open('/x') === 'custom'; window.open = old; return ok; })()"));

    // Có thao tác thật của người dùng: vẫn mở được qua lớp bọc
    const calls = (await ev('window.__r')).openCalls;
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), page.click('#open')]);
    await popup.waitForLoadState('load').catch(() => { });
    check('real click opens the window through the wrapper', (await ev('window.__r')).openCalls === calls + 1 && popup.url().endsWith('/after'), popup.url());
    await popup.close().catch(() => { });

    check('no background warnings', swWarnings.filter((w) => !w.includes('No tab with id')).length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
