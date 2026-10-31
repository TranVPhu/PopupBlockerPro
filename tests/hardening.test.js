const http = require('http');
const fs = require('fs');
const path = require('path');
const { EXT_DIR, eventually, launchExtension, createChecker, runTest } = require('./helpers');
const { check, finish } = createChecker();
runTest(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const pages = {
      '/overlay': '<!doctype html><meta charset="utf-8"><title>t</title><div id="ov" style="position:fixed;inset:0;z-index:9999"></div><div style="height:2000px">x</div>',
      '/suspect': '<!doctype html><meta charset="utf-8"><title>t</title><div id="s" class="overlay-ad" style="position:fixed;inset:0;opacity:0"></div>',
      '/zap': '<!doctype html><meta charset="utf-8"><title>t</title><div id="z" style="width:300px;height:200px;background:red">zap me</div>'
    };
    res.end(pages[req.url] || '<!doctype html><meta charset="utf-8"><title>t</title><div class="ad-banner" id="ad">ad</div><button id="b">x</button>');
  }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const { ctx, sw, extId, swWarnings } = await launchExtension();
  const wl = await sw.evaluate(() => chrome.storage.local.get('whitelist').then(r => r.whitelist));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const dynamicDomainsInclude = (domain) => sw.evaluate(async (d) => (await chrome.declarativeNetRequest.getDynamicRules()).flatMap(r => r.condition.requestDomains || []).includes(d), domain);

  // about:blank trên trang đã tin cậy KHÔNG còn bị coi là đang bảo vệ, trang thường vẫn được bảo vệ
  const frameState = (wait) => page.evaluate(async (wait) => { const f = document.createElement('iframe'); document.body.appendChild(f); const d = f.contentDocument; d.body.innerHTML = '<div class="ad-banner" id="x">ad</div>'; await new Promise(r => setTimeout(r, wait)); return { style: f.contentWindow.getComputedStyle(d.getElementById('x')).display === 'none' }; }, wait);
  await page.goto(base + '/'); await page.waitForLoadState('load');
  check('protected site: about:blank frame protected', (await frameState(3000)).style === true);
  await sw.evaluate((w) => chrome.storage.local.set({ whitelist: [...w, 'localhost'] }), wl);
  await eventually(() => dynamicDomainsInclude('localhost'));
  await page.goto(base + '/'); await page.waitForLoadState('load');
  check('whitelisted site: about:blank frame NOT protected', (await frameState(1000)).style === false);
  await sw.evaluate((w) => chrome.storage.local.set({ whitelist: w }), wl);
  await eventually(async () => !(await dynamicDomainsInclude('localhost')));

  // Lớp phủ: ẩn chứ không xóa, click đi xuyên qua được
  await page.goto(base + '/overlay'); await page.waitForLoadState('load'); await page.waitForTimeout(300);
  await page.mouse.click(400, 300);
  const keptButHidden = (id) => eventually(() => page.evaluate((i) => { const o = document.getElementById(i); return !!o && getComputedStyle(o).display === 'none'; }, id));
  check('invisible overlay hidden on click, node kept', await keptButHidden('ov'));
  await page.goto(base + '/suspect');
  check('suspect overlay hidden, node kept', await keptButHidden('s'));

  // Zapper
  await page.goto(base + '/zap'); await page.waitForLoadState('load'); await page.waitForTimeout(300);
  const tabId = await sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }).then(t => t[0].id));
  await sw.evaluate((id) => chrome.tabs.sendMessage(id, { action: 'start_element_zapper' }, { frameId: 0 }), tabId);
  await page.mouse.move(100, 100); await page.waitForTimeout(100);
  await page.mouse.click(100, 100);
  check('zapper hides element, node kept', await keptButHidden('z'));

  // Không còn gửi URL của link khi click
  await page.goto(base + '/');
  const src = fs.readFileSync(path.join(EXT_DIR, 'bridge.js'), 'utf8');
  check('click message carries no url', !/user_trusted_click[^}]*url/.test(src));

  // Người gửi: content script (sender.url là trang web) không đổi được cấu hình; popup thì được
  const asSender = (sender) => sw.evaluate((s) => new Promise((res) => {
    const t = setTimeout(() => res('no-response'), 3000);
    chrome.runtime.onMessage.dispatch({ action: 'set_temp_allow', host: 'evil-test.vn', minutes: 30 }, s, (r) => { clearTimeout(t); res(r); });
  }), sender);
  const paused = () => sw.evaluate(() => chrome.storage.local.get('tempAllow').then(r => Object.keys(r.tempAllow || {}).includes('evil-test.vn')));
  const extUrl = await sw.evaluate(() => chrome.runtime.getURL('popup.html'));
  await asSender({ id: extId, url: base + '/', tab: { id: 1 } });
  check('content-script sender rejected', !(await paused()));
  await asSender({ id: 'other-extension', url: extUrl });
  check('other extension rejected', !(await paused()));
  await asSender({ id: extId, url: extUrl });
  check('extension page accepted', await paused());
  await sw.evaluate((s) => new Promise((res) => chrome.runtime.onMessage.dispatch({ action: 'set_temp_allow', host: 'evil-test.vn', minutes: 0 }, s, res)), { id: extId, url: extUrl });

  // EasyPrivacy: trình theo dõi bị chặn, kể cả dạng beacon
  const matched = (url, type) => sw.evaluate(async ({ url, type }) => (await chrome.declarativeNetRequest.testMatchOutcome({ url, type, initiator: 'https://example.com', tabId: -1 })).matchedRules.length, { url, type });
  check('analytics script blocked', (await matched('https://www.google-analytics.com/analytics.js', 'script')) > 0);
  check('analytics request blocked', (await matched('https://www.google-analytics.com/g/collect', 'xmlhttprequest')) > 0);
  check('tag manager blocked', (await matched('https://www.googletagmanager.com/gtm.js', 'script')) > 0);
  check('cloudflare insights blocked on third-party site', (await matched('https://static.cloudflareinsights.com/beacon.min.js', 'script')) > 0);
  check('ordinary site not blocked', (await matched('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', 'script')) === 0);

  // IPv6 trong whitelist không làm hỏng các thay đổi sau đó
  await sw.evaluate((w) => chrome.storage.local.set({ whitelist: [...w, '[::1]'] }), wl); await page.waitForTimeout(400);
  await sw.evaluate((w) => chrome.storage.local.set({ whitelist: [...w, '[::1]', 'later-added.vn'] }), wl);
  check('whitelist still updates after IPv6 entry', await eventually(() => dynamicDomainsInclude('later-added.vn')));
  await sw.evaluate((w) => chrome.storage.local.set({ whitelist: w }), wl);
  await eventually(async () => !(await dynamicDomainsInclude('later-added.vn')));

  check('no warnings from background', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close(); server.close();
  finish();
});
