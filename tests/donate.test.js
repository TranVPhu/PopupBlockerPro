// Link ủng hộ chỉ hiện khi có ảnh mã MoMo, và không được tự mở hay nhắc người dùng
const os = require('os');
const fs = require('fs');
const path = require('path');
const { EXT_DIR, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

const QR_FILE = 'momo-qr.png';
// PNG 1x1 để thử, không phải mã thật
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SKIPPED = new Set(['tests', '.git', '.github', '.venv', 'build', 'dist', 'node_modules', '_metadata', '__pycache__', 'scratch']);

// Chép extension ra thư mục tạm để thử cả hai trường hợp, không phụ thuộc file thật có trong repo hay chưa
function extensionCopy(withQr) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-ext-'));
    fs.cpSync(EXT_DIR, dir, { recursive: true, filter: (src) => !SKIPPED.has(path.basename(src)) });
    fs.rmSync(path.join(dir, QR_FILE), { force: true });
    if (withQr) fs.writeFileSync(path.join(dir, QR_FILE), Buffer.from(TINY_PNG, 'base64'));
    return dir;
}

async function openPopup(ctx, extId) {
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(() => !document.getElementById('currentDomain').textContent.includes('Đang kiểm tra'), null, { polling: 100, timeout: 30000 });
    return popup;
}

runTest(async () => {
    // Chưa có ảnh: không hiện link hỏng
    let run = await launchExtension({ extDir: extensionCopy(false) });
    let popup = await openPopup(run.ctx, run.extId);
    await popup.waitForTimeout(500);
    check('no QR file: donate link hidden', !(await popup.isVisible('#donateLink')));
    check('privacy link always visible', await popup.isVisible('#privacyLink'));
    await run.ctx.close();

    // Có ảnh: link hiện, nhưng không tab nào tự mở
    run = await launchExtension({ extDir: extensionCopy(true) });
    const { ctx, extId } = run;
    popup = await openPopup(ctx, extId);
    await popup.waitForSelector('#donateLink:visible', { timeout: 15000 });
    check('QR file present: donate link visible', true);
    const size = await popup.evaluate(() => {
        const box = document.getElementById('donateLink').getBoundingClientRect();
        return { height: box.height, font: parseFloat(getComputedStyle(document.getElementById('donateLink')).fontSize) };
    });
    check('donate link stays small', size.font <= 12 && size.height <= 20, JSON.stringify(size));
    const tabUrls = ctx.pages().map((p) => p.url());
    check('nothing opens by itself', !tabUrls.some((u) => u.includes('donate.html')), tabUrls.join(' '));

    const [donate] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), popup.click('#donateLink')]);
    await donate.waitForLoadState('load');
    check('click opens donate page', donate.url().endsWith('/donate.html'), donate.url());
    check('QR image loads', await donate.evaluate(() => {
        const img = document.getElementById('momoQr');
        return img.complete && img.naturalWidth > 0;
    }));

    const [privacy] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), popup.click('#privacyLink')]);
    await privacy.waitForLoadState('load');
    check('privacy page opens with Limited Use statement', (await privacy.textContent('body')).includes('Limited Use'));

    await ctx.close();
    finish();
});
