// Trang cài đặt: sửa danh sách tin cậy, trang đang tạm bỏ chặn và phần tử đã ẩn, không bao giờ chèn HTML từ dữ liệu
const { eventually, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

runTest(async () => {
    const { ctx, sw, extId, swWarnings } = await launchExtension();
    const errors = [];
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const store = (key) => sw.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k]), key);
    const dynamicDomains = () => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).flatMap((r) => r.condition.requestDomains || []));
    const rows = (selector) => page.locator(`${selector} li.row .name`).allTextContents();
    const open = async () => {
        await page.goto(`chrome-extension://${extId}/options.html`);
        await page.waitForFunction(() => document.querySelectorAll('#trustedList li').length > 0, null, { polling: 100, timeout: 30000 });
    };

    // Hàm chuẩn hóa tên miền (shared.js cũng được nạp trong background)
    const norm = await sw.evaluate(() => ['https://www.Example.com/path?x=1', 'EXAMPLE.com.', 'a.b.co.uk:8080/x', 'localhost', 'not a domain', 'user@evil.com', 'javascript:alert(1)', '-bad.com', 'a..com', '<img src=x>', '[::1]', ''].map(pbNormalizeHost));
    check('domain normalization', norm.join('|') === 'example.com|example.com|a.b.co.uk|localhost||||||||', norm.join('|'));

    check('manifest declares the options page', await sw.evaluate(() => chrome.runtime.getManifest().options_ui.page === 'options.html'));
    await open();
    check('default trusted sites are listed', (await rows('#trustedList')).join() === 'google.com,youtube.com,facebook.com,github.com', (await rows('#trustedList')).join());

    // Thêm: dán cả địa chỉ đầy đủ vẫn ra tên miền
    await page.fill('#trustedInput', 'https://www.Example.com/path?x=1');
    await page.click('#trustedForm button[type=submit]');
    await eventually(async () => (await store('whitelist') || []).includes('example.com'));
    check('adding a pasted url stores the bare domain', (await store('whitelist')).includes('example.com') && (await rows('#trustedList')).includes('example.com'));
    check('input cleared after adding', (await page.inputValue('#trustedInput')) === '');
    check('background turns it into an allow rule', await eventually(async () => (await dynamicDomains()).includes('example.com')));

    // Không hợp lệ hoặc trùng thì không đổi gì và báo lỗi
    const before = JSON.stringify(await store('whitelist'));
    for (const bad of ['not a domain', 'user@evil.com', 'javascript:alert(1)', '   ', '<img src=x onerror=1>']) {
        await page.fill('#trustedInput', bad);
        await page.click('#trustedForm button[type=submit]');
    }
    check('invalid input changes nothing', JSON.stringify(await store('whitelist')) === before);
    check('invalid input shows a message', (await page.textContent('#trustedMessage')).includes('Tên miền không hợp lệ'));
    await page.fill('#trustedInput', 'mail.google.com');
    await page.click('#trustedForm button[type=submit]');
    check('subdomain of a trusted site is reported as already covered', (await page.textContent('#trustedMessage')).includes('đã có') && JSON.stringify(await store('whitelist')) === before);

    // Gỡ
    await page.locator('#trustedList li.row', { hasText: 'example.com' }).getByRole('button').click();
    await eventually(async () => !(await store('whitelist')).includes('example.com'));
    check('removing deletes it from storage', !(await store('whitelist')).includes('example.com'));
    check('background removes the allow rule', await eventually(async () => !(await dynamicDomains()).includes('example.com')));

    // Trang đang tạm bỏ chặn
    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'paused-test.vn', minutes: 30 });
    await eventually(async () => (await rows('#pausedList')).includes('paused-test.vn'));
    check('paused site is listed with minutes left', (await rows('#pausedList')).includes('paused-test.vn') && /còn (29|30) phút/.test(await page.textContent('#pausedList')), await page.textContent('#pausedList'));
    await page.locator('#pausedList li.row').getByRole('button').click();
    await eventually(async () => !Object.keys(await store('tempAllow') || {}).includes('paused-test.vn'));
    check('resume removes the pause', !Object.keys(await store('tempAllow') || {}).includes('paused-test.vn'));
    check('paused list is empty again', await eventually(async () => (await page.locator('#pausedList li.empty').count()) === 1));

    // Phần tử đã ẩn
    await sw.evaluate(() => chrome.storage.local.set({ customHidden: { 'a.vn': ['#x', '.y'], 'b.vn': ['#z'] } }));
    await eventually(async () => (await page.locator('#hiddenList details').count()) === 2);
    check('hidden elements are grouped by site', (await page.locator('#hiddenList summary .name').allTextContents()).join() === 'a.vn,b.vn');
    await page.locator('#hiddenList details', { hasText: 'a.vn' }).locator('summary').click();
    await page.locator('#hiddenList details li.row', { hasText: '#x' }).getByRole('button').click();
    await eventually(async () => JSON.stringify((await store('customHidden'))['a.vn']) === '[".y"]');
    check('removing one selector keeps the others', JSON.stringify((await store('customHidden'))['a.vn']) === '[".y"]');
    check('the list stays open after removing an entry', await page.locator('#hiddenList details', { hasText: 'a.vn' }).evaluate((d) => d.open));
    await page.locator('#hiddenList details', { hasText: 'b.vn' }).locator('summary').getByRole('button').click();
    await eventually(async () => !('b.vn' in (await store('customHidden'))));
    check('restore all removes the site and does not toggle the list', !('b.vn' in (await store('customHidden'))));
    await page.locator('#hiddenList details', { hasText: 'a.vn' }).locator('li.row').getByRole('button').click();
    await eventually(async () => Object.keys(await store('customHidden')).length === 0);
    check('last selector removal drops the site', Object.keys(await store('customHidden')).length === 0);
    check('empty state shown', await eventually(async () => (await page.locator('#hiddenList li.empty').count()) === 1));

    // Selector từ trang web là dữ liệu không đáng tin: phải hiện nguyên văn, không thực thi
    await sw.evaluate(() => chrome.storage.local.set({ customHidden: { 'evil.vn': ['<img src=x onerror="window.__xss=1">', '</li><script>window.__xss=2</script>'] } }));
    await eventually(async () => (await page.locator('#hiddenList details').count()) === 1);
    await page.locator('#hiddenList summary').click();
    await page.waitForTimeout(500);
    check('selectors are shown as plain text', (await page.textContent('#hiddenList')).includes('<img src=x onerror="window.__xss=1">'));
    check('no element was created from the data', (await page.locator('#hiddenList img, #hiddenList script, body > script:not([src])').count()) === 0);
    check('no script from the data ran', (await page.evaluate(() => window.__xss)) === undefined);
    await sw.evaluate(() => chrome.storage.local.set({ customHidden: {} }));

    // Đổi ngôn ngữ từ nơi khác: trang tự đổi theo
    await sw.evaluate(() => chrome.storage.local.set({ language: 'en' }));
    await eventually(async () => (await page.textContent('h1')).includes('Settings'));
    const english = await page.evaluate(() => {
        const copy = document.body.cloneNode(true);
        copy.querySelectorAll('script').forEach((n) => n.remove());
        return copy.textContent.replace(/\s+/g, ' ');
    });
    check('page follows a language change', english.includes('Trusted sites') && english.includes('Paused sites'));
    check('english page has no vietnamese', !VIETNAMESE.test(english), english.slice(0, 200));
    check('placeholder translated', (await page.getAttribute('#trustedInput', 'placeholder')).includes('for example'));
    await page.fill('#trustedInput', 'bad input');
    await page.click('#trustedForm button[type=submit]');
    check('error message translated', (await page.textContent('#trustedMessage')).includes('valid domain'));
    await sw.evaluate(() => chrome.storage.local.set({ language: 'vi' }));
    await eventually(async () => (await page.textContent('h1')).includes('Cài đặt'));

    // Mở từ popup
    // Chrome dùng lại tab cài đặt đang mở, nên đóng nó đi để thấy tab mới
    await page.goto('about:blank');
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    check('popup has a settings link', await popup.isVisible('#settingsLink'));
    const [opened] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), popup.click('#settingsLink')]);
    await opened.waitForLoadState('load');
    check('settings link opens the options page', opened.url().endsWith('/options.html'), opened.url());

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    finish();
});
