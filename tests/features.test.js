// Kiểm tra tạm bỏ chặn, bộ đếm, ngoại lệ @@ và quy tắc ## trên extension thật + trang thật
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EXT_DIR, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

// Mở popup dạng tab nền để tabs.query({active}) trả về trang web đang xét
async function openPopup(ctx, extId, webPage) {
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await webPage.bringToFront();
    await popup.reload();
    await popup.waitForFunction(() => !document.getElementById('currentDomain').textContent.includes('Đang kiểm tra'), null, { timeout: 8000 });
    await popup.waitForTimeout(400);
    return popup;
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
            <script>window.__open = () => window.open('https://example.com/');</script>`);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;

    const { ctx, sw, extId, swWarnings } = await launchExtension();

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
    await web.waitForTimeout(1200);
    let popup = await openPopup(ctx, extId, web);
    const tabId = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: 'http://localhost/*' }, (t) => r(t[0].id))));
    const badge1 = await popup.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    const shown1 = await popup.textContent('#tabCount');
    const global1 = Number(await popup.textContent('#count'));
    check('badge counts 3 blocked requests', badge1 === '3', `badge="${badge1}"`);
    check('popup "Trang này" equals badge', shown1 === badge1, `popup=${shown1}`);
    check('popup "Toàn hệ thống" includes network blocks', global1 >= 3, `global=${global1}`);

    await popup.reload();
    await popup.waitForTimeout(600);
    const global2 = Number(await popup.textContent('#count'));
    check('global count not double counted on reopen', global2 === global1, `${global1} -> ${global2}`);

    // Popup bị chặn phải cộng vào cả badge lẫn số trong bảng
    await web.evaluate(() => window.__open());
    await web.waitForTimeout(500);
    await popup.reload();
    await popup.waitForTimeout(600);
    const badge2 = await popup.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    check('blocked popup adds to badge and panel', badge2 === '4' && (await popup.textContent('#tabCount')) === '4', `badge=${badge2}`);

    // Tải lại trang: số của trang reset, số tổng giữ nguyên
    await web.reload();
    await web.waitForTimeout(1000);
    await popup.reload();
    await popup.waitForTimeout(600);
    check('page count resets on navigation', (await popup.textContent('#tabCount')) === '3', await popup.textContent('#tabCount'));
    check('global count keeps growing', Number(await popup.textContent('#count')) >= global2 + 4, await popup.textContent('#count'));
    await popup.close();

    // === Tạm bỏ chặn ===
    popup = await openPopup(ctx, extId, web);
    check('pause button shown', (await popup.textContent('#pauseBtn')).includes('Tạm bỏ chặn trang này (30 phút)'));

    const reloaded = web.waitForNavigation({ timeout: 8000 });
    await popup.evaluate(() => { window.close = () => { }; document.getElementById('pauseBtn').click(); });
    await reloaded;
    await web.waitForTimeout(1200);
    const stored = await sw.evaluate(() => chrome.storage.local.get('tempAllow'));
    check('pause stored with expiry about 30 minutes', Math.abs(stored.tempAllow.localhost - Date.now() - 30 * 60000) < 15000);
    const failedImgs = await web.evaluate(() => performance.getEntriesByType('resource').filter(e => e.initiatorType === 'img').length);
    await popup.reload();
    await popup.waitForTimeout(600);
    check('paused: panel shows paused state', (await popup.textContent('#currentDomain')).includes('tạm bỏ chặn'), await popup.textContent('#currentDomain'));
    check('paused: button offers resume with minutes left', /Chặn lại ngay \(còn (29|30) phút\)/.test(await popup.textContent('#pauseBtn')), await popup.textContent('#pauseBtn'));
    check('paused: no requests blocked on page', (await popup.textContent('#tabCount')) === '0', `tab=${await popup.textContent('#tabCount')} imgs=${failedImgs}`);
    await web.evaluate(() => window.__open());
    await web.waitForTimeout(600);
    const pages = ctx.pages().map(p => p.url());
    check('paused: window.open passes through', pages.some(u => u.startsWith('https://example.com') || u === 'about:blank'), pages.join(' '));
    for (const p of ctx.pages()) if (p !== web && p !== popup && !p.url().startsWith('chrome') && !p.url().includes('localhost')) await p.close();

    // Hết hạn: mô phỏng bằng cách tua ngày hết hạn + kích hoạt lại, không phải đợi 30 phút
    await sw.evaluate(async () => {
        const { tempAllow } = await chrome.storage.local.get('tempAllow');
        tempAllow.localhost = Date.now() + 1500;
        await chrome.storage.local.set({ tempAllow });
    });
    await popup.reload();
    await popup.waitForTimeout(2200);
    await popup.reload();
    await popup.waitForTimeout(400);
    check('expired: UI back to protected even before alarm fires', (await popup.textContent('#currentDomain')).includes('Đang bảo vệ'), await popup.textContent('#currentDomain'));

    // Chặn lại ngay
    const r2 = await sendAsPopup(sw, { action: 'set_temp_allow', host: 'localhost', minutes: 30 });
    await web.reload();
    await web.waitForTimeout(800);
    await popup.reload();
    await popup.waitForTimeout(500);
    check('paused again', (await popup.textContent('#pauseBtn')).includes('Chặn lại ngay'));
    const again = web.waitForNavigation({ timeout: 8000 });
    await popup.evaluate(() => { window.close = () => { }; document.getElementById('pauseBtn').click(); });
    await again;
    await web.waitForTimeout(1000);
    await popup.reload();
    await popup.waitForTimeout(600);
    check('resume: blocking active again', (await popup.textContent('#tabCount')) === '3' && (await popup.textContent('#pauseBtn')).includes('Tạm bỏ chặn'), await popup.textContent('#tabCount'));
    check('resume: dynamic allow rules removed', (await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).flatMap(r => r.condition.requestDomains || []))).includes('localhost') === false);
    check('resume: expiry alarm cleared when nothing paused', !(await sw.evaluate(() => chrome.alarms.get('pb_temp_allow_expiry'))));
    check('count alarm registered', !!(await sw.evaluate(() => chrome.alarms.get('pb_sync_dnr_counts'))));

    // Trang đã whitelist không hiện nút tạm bỏ chặn
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: [...r.whitelist, 'localhost'] })));
    await popup.reload();
    await popup.waitForTimeout(500);
    check('whitelisted: pause button hidden', !(await popup.isVisible('#pauseBtn')));
    await sw.evaluate(() => chrome.storage.local.get('whitelist').then((r) => chrome.storage.local.set({ whitelist: r.whitelist.filter(d => d !== 'localhost') })));

    check('no service worker errors', swWarnings.length === 0, swWarnings.join(' | '));
    await ctx.close();
    server.close();
    finish();
});
