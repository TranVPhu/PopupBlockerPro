// Kiểm tra tạm bỏ chặn, bộ đếm, ngoại lệ @@ và quy tắc ## trên extension thật + trang thật
const http = require('http');
const { eventually, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

// Mở popup dạng tab nền để tabs.query({active}) trả về trang web đang xét
async function openPopup(ctx, extId, webPage) {
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await webPage.bringToFront();
    await popup.reload();
    await waitRendered(popup);
    return popup;
}

// Popup là tab nền nên requestAnimationFrame không chạy: bắt buộc dùng polling theo thời gian
function waitRendered(popup) {
    return popup.waitForFunction(() => !document.getElementById('currentDomain').textContent.includes('Đang kiểm tra'), null, { polling: 100, timeout: 30000 });
}

// Mở lại bảng điều khiển để đọc số liệu mới nhất. Mỗi lần mở tốn 1 lượt getMatchedRules (tối đa 20 lượt/10 phút),
// nên muốn chờ thì chờ badge rồi mới đọc, không đọc lặp
async function readPanel(popup) {
    await popup.reload();
    await waitRendered(popup);
    return {
        tab: await popup.textContent('#tabCount'),
        global: Number(await popup.textContent('#count')),
        domain: await popup.textContent('#currentDomain'),
        pause: await popup.textContent('#pauseBtn')
    };
}

async function outcome(sw, url, type, initiator) {
    return sw.evaluate(async ({ url, type, initiator }) => {
        const r = await chrome.declarativeNetRequest.testMatchOutcome({ url, type, initiator, tabId: -1 });
        return r.matchedRules.map(m => `${m.rulesetId}:${m.ruleId}`);
    }, { url, type, initiator });
}

runTest(async () => {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        // Mỗi lần tải trang gọi 3 request tới mạng quảng cáo
        res.end(`<!doctype html><meta charset="utf-8"><title>t</title><div id="c">nội dung</div>
            <img src="https://pubmatic.com/a.png"><img src="https://casalemedia.com/b.png"><img src="https://rubiconproject.com/c.png">
            <script>window.__open = () => { window.open('http://example.com/'); };</script>`);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;

    const { ctx, sw, extId, swWarnings } = await launchExtension({ resolveTo: `127.0.0.1:${server.address().port}` });

    // === Quy tắc mạng ===
    const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
    check('static ruleset enabled', enabled.includes('popup_ad_rules'));
    const blocked = await outcome(sw, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script', 'https://example.com');
    check('@@: ad script still blocked on normal site', blocked.length === 1 && /popup_ad_rules:\d{1,4}$/.test(blocked[0]), blocked.join());
    const allowed = await outcome(sw, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script', 'https://laodong.vn');
    check('@@: same script allowed on site listed in exception', allowed.some(r => /:1\d{5}$/.test(r)) || allowed.length === 0, allowed.join());
    const ima = await outcome(sw, 'https://imasdk.googleapis.com/js/sdkloader/ima3.js', 'script', 'https://vtvgo.vn');
    check('@@: IMA SDK allowed on vtvgo (video would break otherwise)', !ima.some(r => /popup_ad_rules:[1-4]$/.test(r)) , ima.join());
    const imaOther = await outcome(sw, 'https://imasdk.googleapis.com/js/sdkloader/ima3.js', 'script', 'https://example.com');
    check('IMA SDK still blocked elsewhere', imaOther.some(r => /popup_ad_rules:1$/.test(r)), imaOther.join());

    // === Bộ đếm ===
    const web = await ctx.newPage();
    await web.goto(base + '/page');
    let popup = await openPopup(ctx, extId, web);
    const tabId = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: 'http://localhost/*' }, (t) => r(t[0].id))));
    const badge = () => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    const badgeBecomes = (value) => eventually(async () => (await badge()) === value);
    // Chrome tự đếm và có thể thiếu nếu request bị chặn trước khi bộ đếm được reset lúc commit,
    // nên chỉ yêu cầu số ổn định trong khoảng từ 1 tới số request của trang
    const badgeSettled = async () => {
        let last = '';
        await eventually(async () => {
            const now = await badge();
            const stable = !!now && now === last;
            last = now;
            await new Promise((r) => setTimeout(r, 500));
            return stable;
        });
        return last;
    };
    const isPageCount = (text) => Number(text) >= 1 && Number(text) <= 3;
    const badge1 = await badgeSettled();
    const panel1 = await readPanel(popup);
    const shown1 = panel1.tab;
    const global1 = panel1.global;
    check('badge counts blocked requests', isPageCount(badge1), `badge="${badge1}"`);
    check('popup "Trang này" equals badge', shown1 === badge1, `popup=${shown1}`);
    check('popup "Toàn hệ thống" includes network blocks', global1 >= Number(badge1), `global=${global1}`);

    const global2 = (await readPanel(popup)).global;
    check('global count not double counted on reopen', global2 === global1, `${global1} -> ${global2}`);

    // Popup bị chặn phải cộng vào cả badge lẫn số trong bảng
    await web.evaluate(() => window.__open());
    const expectedBadge = String(Number(badge1) + 1);
    await badgeBecomes(expectedBadge);
    const badge2 = await badge();
    const panel2 = await readPanel(popup);
    check('blocked popup adds to badge and panel', badge2 === expectedBadge && panel2.tab === expectedBadge, `badge=${badge2} panel=${panel2.tab}`);

    // Tải lại trang: số của trang reset, số tổng giữ nguyên
    await web.reload();
    const badge3 = await badgeSettled();
    const panel3 = await readPanel(popup);
    check('page count resets on navigation', isPageCount(panel3.tab) && panel3.tab === badge3, `panel=${panel3.tab} badge=${badge3}`);
    check('global count keeps growing', panel3.global > global2, `${global2} -> ${panel3.global}`);
    await popup.close();

    // === Tạm bỏ chặn ===
    popup = await openPopup(ctx, extId, web);
    check('pause button shown', (await popup.textContent('#pauseBtn')).includes('Tạm bỏ chặn trang này (30 phút)'));

    const reloaded = web.waitForNavigation({ timeout: 30000 });
    await popup.evaluate(() => { window.close = () => { }; document.getElementById('pauseBtn').click(); });
    await reloaded;
    await web.waitForLoadState('load');
    const stored = await sw.evaluate(() => chrome.storage.local.get('tempAllow'));
    check('pause stored with expiry about 30 minutes', Math.abs(stored.tempAllow.localhost - Date.now() - 30 * 60000) < 60000);
    const failedImgs = await web.evaluate(() => performance.getEntriesByType('resource').filter(e => e.initiatorType === 'img').length);
    const paused = await readPanel(popup);
    check('paused: panel shows paused state', paused.domain.includes('tạm bỏ chặn'), paused.domain);
    check('paused: button offers resume with minutes left', /Chặn lại ngay \(còn (2[89]|30) phút\)/.test(paused.pause), paused.pause);
    check('paused: no requests blocked on page', paused.tab === '0', `tab=${paused.tab} imgs=${failedImgs}`);
    await web.evaluate(() => window.__open());
    const passedThrough = await eventually(() => ctx.pages().some((p) => p.url().startsWith('http://example.com')));
    check('paused: window.open passes through', passedThrough, ctx.pages().map((p) => p.url()).join(' '));
    for (const p of ctx.pages()) if (p !== web && p !== popup && !p.url().startsWith('chrome') && !p.url().includes('localhost')) await p.close();

    // Hết hạn: mô phỏng bằng cách tua ngày hết hạn + kích hoạt lại, không phải đợi 30 phút
    await sw.evaluate(async () => {
        const { tempAllow } = await chrome.storage.local.get('tempAllow');
        tempAllow.localhost = Date.now() + 1500;
        await chrome.storage.local.set({ tempAllow });
    });
    await new Promise((r) => setTimeout(r, 2000));
    const expired = await readPanel(popup);
    check('expired: UI back to protected even before alarm fires', expired.domain.includes('Đang bảo vệ'), expired.domain);

    // Chặn lại ngay
    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'localhost', minutes: 30 });
    await web.reload();
    check('paused again', (await readPanel(popup)).pause.includes('Chặn lại ngay'));
    const again = web.waitForNavigation({ timeout: 30000 });
    await popup.evaluate(() => { window.close = () => { }; document.getElementById('pauseBtn').click(); });
    await again;
    await badgeSettled();
    const resumed = await readPanel(popup);
    check('resume: blocking active again', isPageCount(resumed.tab) && resumed.pause.includes('Tạm bỏ chặn'), resumed.tab);
    check('resume: dynamic allow rules removed', (await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).flatMap(r => r.condition.requestDomains || []))).includes('localhost') === false);
    check('resume: expiry alarm cleared when nothing paused', !(await sw.evaluate(() => chrome.alarms.get('pb_temp_allow_expiry'))));
    check('count alarm registered', !!(await sw.evaluate(() => chrome.alarms.get('pb_sync_dnr_counts'))));

    // Trang đã whitelist không hiện nút tạm bỏ chặn
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: [...r.whitelist, 'localhost'] })));
    await readPanel(popup);
    check('whitelisted: pause button hidden', !(await popup.isVisible('#pauseBtn')));
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: r.whitelist.filter(d => d !== 'localhost') })));

    check('no service worker errors', swWarnings.length === 0, swWarnings.join(' | '));
    await ctx.close();
    server.close();
    finish();
});
