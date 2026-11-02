// Các chiêu mở tab quảng cáo: redirect qua trung gian, click vào vùng trống, và các trường hợp hợp lệ KHÔNG được đóng
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <p id="blank" style="position:absolute;left:600px;top:500px;width:200px;height:50px">văn bản thường</p>
    <button id="btn" style="position:absolute;left:0;top:0;width:120px;height:40px">Nút</button>
    <a id="link" href="http://example.org/link" target="_blank" style="position:absolute;left:0;top:50px">Link</a>
    <div id="ptr" style="position:absolute;left:0;top:90px;width:120px;height:40px;cursor:pointer">div bấm được</div>
    <a id="cover" href="http://example.org/cover" target="_blank" style="position:fixed;inset:0;z-index:-1"></a>`;

runTest(async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/to-listed') {
            res.writeHead(302, { location: 'http://popads.net/' });
            return res.end();
        }
        if (req.url === '/to-unknown') {
            res.writeHead(302, { location: 'http://example.org/after-redirect' });
            return res.end();
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(PAGE);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;

    // Mọi tên miền đều trỏ về server này để kết quả không phụ thuộc mạng
    const { ctx, sw, swWarnings } = await launchExtension({ resolveTo: `127.0.0.1:${server.address().port}` });
    const page = await ctx.newPage();
    await sw.evaluate(() => {
        globalThis.createdTabs = [];
        chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => createdTabs.push(d.tabId));
    });
    const tabInfo = (id) => sw.evaluate((tabId) => chrome.tabs.get(tabId).then((t) => ({ url: t.url, status: t.status }), () => null), id);

    // Thực hiện một thao tác rồi trả về URL của tab mới nếu nó còn sống sau khi đã tải xong.
    // Hỏi trực tiếp chrome.tabs: tab có thể bị đóng trước khi Playwright kịp thấy
    async function tabsOpenedBy(action) {
        // Đóng popup có thể làm trang này xuống nền, mà page.click cần requestAnimationFrame vốn không chạy ở tab nền
        await page.bringToFront();
        await page.goto(base + '/');
        await page.waitForLoadState('load');
        await sw.evaluate(() => { createdTabs.length = 0; });
        await action();
        const [tabId] = await eventually(() => sw.evaluate(() => createdTabs.length > 0 && createdTabs.slice()), 5000) || [];
        if (!tabId) return [];
        await eventually(async () => {
            const tab = await tabInfo(tabId);
            return !tab || (tab.status === 'complete' && tab.url && tab.url !== 'about:blank');
        }, 20000);
        // Nếu sắp bị đóng thì lệnh đóng đã được gửi lúc tab vừa tải xong
        await page.waitForTimeout(1500);
        const tab = await tabInfo(tabId);
        if (!tab) return [];
        await sw.evaluate((id) => chrome.tabs.remove(id), tabId);
        return [tab.url];
    }
    const onClick = (selector, fnBody) => async () => {
        await page.evaluate(({ selector, fnBody }) => {
            document.querySelector(selector).addEventListener('click', new Function(fnBody), { once: true });
        }, { selector, fnBody });
        await page.click(selector);
    };

    // === Phải đóng ===
    let urls = await tabsOpenedBy(onClick('#btn', "window.open('/to-listed')"));
    check('redirect into listed popup domain is closed, even after a real button click', urls.length === 0, urls.join());

    urls = await tabsOpenedBy(onClick('#btn', "const w = window.open('about:blank'); w.location = 'http://popads.net/';"));
    check('about:blank then location to listed domain is closed', urls.length === 0, urls.join());

    urls = await tabsOpenedBy(onClick('#blank', "window.open('http://example.org/ad')"));
    check('click on plain text opening cross-site tab is closed', urls.length === 0, urls.join());

    urls = await tabsOpenedBy(async () => {
        await page.evaluate(() => document.addEventListener('click', () => window.open('http://example.org/ad'), { once: true }));
        await page.mouse.click(900, 650);
    });
    check('click on empty area opening cross-site tab is closed', urls.length === 0, urls.join());

    urls = await tabsOpenedBy(async () => {
        await page.evaluate(() => { document.getElementById('cover').style.zIndex = '9999'; });
        await page.mouse.click(900, 650);
    });
    check('full-page invisible link is closed', urls.length === 0, urls.join());

    urls = await tabsOpenedBy(async () => {
        await page.evaluate(() => { window.addEventListener('click', () => window.open('/to-unknown'), { once: true }); });
        await page.mouse.click(900, 650);
    });
    check('same-site popup from empty area redirecting cross-site is closed', urls.length === 0, urls.join());

    // === Không được đóng ===
    urls = await tabsOpenedBy(() => page.click('#link'));
    check('real link with target=_blank stays', urls.length === 1, urls.join());

    urls = await tabsOpenedBy(onClick('#btn', "window.open('http://example.org/pay')"));
    check('real button opening cross-site window stays', urls.length === 1, urls.join());

    urls = await tabsOpenedBy(onClick('#ptr', "window.open('http://example.org/x')"));
    check('cursor:pointer element opening cross-site window stays', urls.length === 1, urls.join());

    urls = await tabsOpenedBy(onClick('#btn', "window.open('/to-unknown')"));
    check('button click redirecting to unknown site stays', urls.length === 1, urls.join());

    urls = await tabsOpenedBy(onClick('#blank', "window.open('/same-site')"));
    check('same-site tab from plain text click stays', urls.length === 1, urls.join());

    urls = await tabsOpenedBy(onClick('#blank', "window.open('https://accounts.google.com/o/oauth2')"));
    check('OAuth domain is never closed', urls.length === 1, urls.join());

    // Tab mới rồi người dùng tự bấm link trong tab đó: không bị đóng dù tab đang được theo dõi
    await page.goto(base + '/');
    await page.waitForLoadState('load');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#btn').then(() => page.evaluate(() => window.open('/same-site')))]).catch(() => [null]);
    if (popup) {
        await popup.waitForLoadState().catch(() => { });
        await popup.evaluate(() => { const a = document.getElementById('link'); a.removeAttribute('target'); });
        await popup.click('#link').catch(() => { });
        await page.waitForTimeout(1500);
        check('user clicking a link inside a watched tab keeps it open', !popup.isClosed());
        await popup.close().catch(() => { });
    } else {
        console.log('SKIP  popup not opened (no user activation left)');
    }

    // Menu chuột phải: không bấm được menu thật, nên phát sự kiện đúng như trình duyệt khi người dùng chọn "Mở trong tab mới"
    async function afterContextMenu(rightClick) {
        await page.bringToFront();
        await page.goto(base + '/');
        await page.waitForLoadState('load');
        const sourceTabId = await sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }).then((t) => t[0].id));
        if (rightClick) await page.click('#link', { button: 'right' });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const newTabId = await sw.evaluate((url) => chrome.tabs.create({ url, active: false }).then((t) => t.id), base + '/new-tab');
        await sw.evaluate(({ sourceTabId, newTabId }) => {
            chrome.webNavigation.onCreatedNavigationTarget.dispatch({
                sourceTabId, tabId: newTabId, sourceFrameId: 0, url: 'http://example.org/from-menu', timeStamp: Date.now()
            });
        }, { sourceTabId, newTabId });
        // Tab bị đóng thì thấy ngay, tab được giữ thì phải đợi hết thời gian
        const closed = await eventually(async () => !(await tabInfo(newTabId)), 4000);
        const alive = !closed;
        if (alive) await sw.evaluate((id) => chrome.tabs.remove(id), newTabId);
        return alive;
    }
    check('new tab right after right-click stays (context menu)', await afterContextMenu(true));
    check('same event without right-click is still closed', !(await afterContextMenu(false)));

    // Redirect có thể hoàn tất trước khi background đăng ký xong tab mới, VD lúc service worker vừa thức dậy.
    // Phát hai sự kiện liền nhau để tái hiện chắc chắn thay vì trông chờ máy chậm
    await page.bringToFront();
    await page.goto(base + '/');
    await page.waitForLoadState('load');
    const raceSourceTabId = await sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }).then((t) => t[0].id));
    const raceTabId = await sw.evaluate(async ({ sourceTabId, url }) => {
        const tab = await chrome.tabs.create({ url, active: false });
        chrome.webNavigation.onCreatedNavigationTarget.dispatch({
            sourceTabId, tabId: tab.id, sourceFrameId: 0, url: 'http://localhost/step', timeStamp: Date.now()
        });
        chrome.webNavigation.onCommitted.dispatch({
            tabId: tab.id, frameId: 0, url: 'http://popads.net/', transitionType: 'link', timeStamp: Date.now()
        });
        return tab.id;
    }, { sourceTabId: raceSourceTabId, url: base + '/new-tab' });
    const raceClosed = await eventually(async () => !(await tabInfo(raceTabId)), 5000);
    check('redirect committing before the new tab is registered is still closed', raceClosed);
    if (!raceClosed) await sw.evaluate((id) => chrome.tabs.remove(id), raceTabId);

    check('no background warnings', swWarnings.filter((w) => !w.includes('No tab with id')).length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
