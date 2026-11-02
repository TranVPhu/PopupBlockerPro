// Mục chọn ngôn ngữ: đổi được ngay, nhớ lựa chọn, và không còn sót chữ tiếng Việt khi chọn tiếng Anh
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

// Chữ cái có dấu chỉ tiếng Việt mới dùng, để phát hiện chuỗi chưa dịch
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

runTest(async () => {
    const server = http.createServer((_, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><meta charset="utf-8"><title>t</title><div id="z" style="width:300px;height:200px">x</div>');
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;

    const { ctx, sw, extId, swWarnings } = await launchExtension();
    const errors = [];
    const newPage = async () => {
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        return page;
    };

    // Từ điển hai ngôn ngữ phải khớp nhau: thiếu khóa sẽ làm hỏng giao diện
    const dictionary = await sw.evaluate(() => PB_STRINGS);
    const keysOf = (lang) => Object.keys(dictionary[lang]).sort().join();
    const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join();
    check('both languages have the same keys', keysOf('vi') === keysOf('en'));
    check('placeholders match in both languages', Object.keys(dictionary.vi).every((k) => slots(dictionary.vi[k]) === slots(dictionary.en[k])));
    check('english has no untranslated text', !Object.values(dictionary.en).some((t) => VIETNAMESE.test(t)));

    // Lần đầu theo trình duyệt, đã chọn thì theo lựa chọn
    const resolved = await sw.evaluate(() => [
        pbResolveLanguage(undefined, 'vi'), pbResolveLanguage(undefined, 'vi-VN'), pbResolveLanguage(undefined, 'en-US'),
        pbResolveLanguage(undefined, 'fr'), pbResolveLanguage('en', 'vi'), pbResolveLanguage('vi', 'en'), pbResolveLanguage('xx', 'en'),
        pbResolveLanguage('constructor', 'vi')
    ]);
    check('language resolution', resolved.join() === 'vi,vi,en,en,en,vi,en,vi', resolved.join());

    const web = await newPage();
    await web.goto(base + '/');
    await web.waitForLoadState('load');

    const popup = await newPage();
    const rendered = () => popup.waitForFunction(() => {
        const box = document.getElementById('currentDomain').textContent;
        return !box.includes('Đang kiểm tra') && !box.includes('Checking');
    }, null, { polling: 100, timeout: 30000 });
    const openPopup = async () => {
        await web.bringToFront();
        await popup.goto(`chrome-extension://${extId}/popup.html`);
        await rendered();
    };
    // Tên ngôn ngữ trong ô chọn cố ý giữ nguyên
    const popupText = () => popup.evaluate(() => {
        const copy = document.body.cloneNode(true);
        copy.querySelector('#languageSelect').remove();
        copy.querySelectorAll('script, [hidden]').forEach((n) => n.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    });

    await openPopup();
    check('starts in vietnamese', (await popup.inputValue('#languageSelect')) === 'vi' && (await popup.textContent('#toggleBtn')).includes('ĐANG BẬT'));
    check('selector offers both languages', (await popup.locator('#languageSelect option').allTextContents()).join() === 'Tiếng Việt,English');

    // Đổi sang tiếng Anh: áp dụng ngay, kể cả các chữ vẽ theo trạng thái
    await popup.selectOption('#languageSelect', 'en');
    check('switch applies right away', (await popup.textContent('#toggleBtn')) === 'ENABLED ON ALL SITES', await popup.textContent('#toggleBtn'));
    check('dynamic text translated', (await popup.textContent('#currentDomain')).includes('Protecting: localhost') && (await popup.textContent('#pauseBtn')).includes('Pause on this site (30 min)'));
    check('no vietnamese left in popup', !VIETNAMESE.test(await popupText()), await popupText());
    check('page language updated', (await popup.evaluate(() => document.documentElement.lang)) === 'en');
    check('tooltips translated', !VIETNAMESE.test(await popup.getAttribute('#pickerBtn', 'title')));

    // Mở lại vẫn nhớ
    await openPopup();
    check('choice remembered', (await popup.inputValue('#languageSelect')) === 'en' && (await popup.textContent('#toggleBtn')) === 'ENABLED ON ALL SITES');

    // Thử các trạng thái khác của popup bằng tiếng Anh
    await sw.evaluate(() => new Promise((resolve) => {
        const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') };
        chrome.runtime.onMessage.dispatch({ action: 'set_temp_allow', host: 'localhost', minutes: 30 }, sender, resolve);
    }));
    await openPopup();
    check('paused state translated', (await popup.textContent('#currentDomain')).includes('Paused on') && /Resume now \(\d+ min left\)/.test(await popup.textContent('#pauseBtn')));
    await popup.selectOption('#languageSelect', 'vi');
    check('switching while paused keeps state', (await popup.textContent('#currentDomain')).includes('Đang tạm bỏ chặn'));
    await popup.selectOption('#languageSelect', 'en');
    await sw.evaluate(() => new Promise((resolve) => {
        const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') };
        chrome.runtime.onMessage.dispatch({ action: 'set_temp_allow', host: 'localhost', minutes: 0 }, sender, resolve);
    }));

    // Khung hướng dẫn hiện trên trang web
    const tabId = await sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }).then((t) => t[0].id));
    const bannerText = async (action, id) => {
        await web.bringToFront();
        await web.reload();
        await web.waitForLoadState('load');
        await web.waitForTimeout(500);
        await sw.evaluate(({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action }, { frameId: 0 }), { tabId, action });
        const found = await eventually(() => web.locator(`#${id}`).count());
        return found ? web.textContent(`#${id}`) : '';
    };
    const zapperEn = await bannerText('start_element_zapper', 'pb-zapper-banner');
    check('zapper banner translated', zapperEn.includes('Quick hide') && !VIETNAMESE.test(zapperEn), zapperEn);
    const pickerEn = await bannerText('start_element_picker', 'pb-picker-banner');
    check('picker banner translated', pickerEn.includes('Element picker') && !VIETNAMESE.test(pickerEn), pickerEn);

    // Trang đang mở nhận ngôn ngữ mới mà không cần tải lại
    await web.reload();
    await web.waitForLoadState('load');
    await web.waitForTimeout(500);
    await sw.evaluate(() => chrome.storage.local.set({ language: 'vi' }));
    await web.waitForTimeout(500);
    await sw.evaluate((id) => chrome.tabs.sendMessage(id, { action: 'start_element_zapper' }, { frameId: 0 }), tabId);
    await eventually(() => web.locator('#pb-zapper-banner').count());
    check('open page follows language change', (await web.textContent('#pb-zapper-banner')).includes('Tẩy nhanh'));
    await sw.evaluate(() => chrome.storage.local.set({ language: 'en' }));

    // Trang QR
    const qr = await newPage();
    await qr.goto(`chrome-extension://${extId}/qr.html?url=${encodeURIComponent('https://example.com/')}`);
    await eventually(async () => (await qr.textContent('#downloadBtn')).includes('Download'));
    check('qr page translated', (await qr.textContent('#downloadBtn')).includes('Download PNG') && (await qr.textContent('#copyBtn')).includes('Copy image'));
    check('qr title translated', (await qr.title()) === 'Create QR code', await qr.title());
    await qr.fill('#linkInput', '   ');
    check('qr message translated', (await qr.textContent('#message')).includes('Paste a link'));
    check('qr page has no vietnamese', !VIETNAMESE.test(await qr.evaluate(() => {
        const copy = document.body.cloneNode(true);
        copy.querySelectorAll('script').forEach((n) => n.remove());
        return copy.textContent;
    })));

    // Trang ủng hộ
    const donate = await newPage();
    await donate.goto(`chrome-extension://${extId}/donate.html`);
    await eventually(async () => (await donate.textContent('h1')).includes('Support'));
    check('donate page translated', !VIETNAMESE.test(await donate.evaluate(() => {
        const copy = document.body.cloneNode(true);
        copy.querySelectorAll('script').forEach((n) => n.remove());
        return copy.textContent;
    })));

    // Trang quyền riêng tư chỉ hiện đúng ngôn ngữ đã chọn
    const privacy = await newPage();
    await privacy.goto(`chrome-extension://${extId}/privacy.html`);
    await eventually(() => privacy.evaluate(() => document.querySelector('[data-lang="vi"]').hidden));
    check('privacy shows english only', await privacy.isVisible('[data-lang="en"]') && !(await privacy.isVisible('[data-lang="vi"]')));
    check('privacy english covers limited use and licenses', /Limited Use[\s\S]*Licenses/.test(await privacy.textContent('[data-lang="en"]')));

    // Menu chuột phải đổi theo ngôn ngữ
    await sw.evaluate(() => {
        globalThis.menuTitles = {};
        const update = chrome.contextMenus.update.bind(chrome.contextMenus);
        chrome.contextMenus.update = (id, props) => {
            menuTitles[id] = props.title;
            return update(id, props);
        };
    });
    await sw.evaluate(() => chrome.storage.local.set({ language: 'vi' }));
    await eventually(() => sw.evaluate(() => Object.keys(menuTitles).length === 5));
    check('context menu follows language', (await sw.evaluate(() => menuTitles.create_link_qr)).includes('Tạo mã QR'));
    await sw.evaluate(() => chrome.storage.local.set({ language: 'en' }));
    await eventually(() => sw.evaluate(() => menuTitles.create_link_qr.includes('Create QR')));
    check('context menu switches to english', !VIETNAMESE.test(await sw.evaluate(() => Object.values(menuTitles).join(' '))));

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
