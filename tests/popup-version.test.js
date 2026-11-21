// Menu xổ xuống ghi số phiên bản đang cài ở góc dưới bên phải, lấy từ manifest
const fs = require('fs');
const path = require('path');
const { EXT_DIR, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

runTest(async () => {
    const version = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8')).version;
    const { ctx, extId, swWarnings } = await launchExtension();
    const popup = await ctx.newPage();
    const errors = [];
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(() => document.getElementById('versionLabel').textContent !== '', null, { timeout: 30000 });

    check('popup shows the manifest version', (await popup.textContent('#versionLabel')) === `v${version}`, await popup.textContent('#versionLabel'));

    const box = await popup.evaluate(() => {
        const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
        return { version: rect('versionLabel'), language: rect('languageSelect'), body: document.body.getBoundingClientRect().toJSON() };
    });
    check('version is at the right edge, below the buttons', box.version.right > box.body.right - 20 && box.version.top > box.language.top - 10, JSON.stringify(box.version));
    check('version does not overlap the language selector', box.version.left > box.language.right, `${box.version.left} vs ${box.language.right}`);
    check('language selector stays centered', Math.abs((box.language.left + box.language.right) / 2 - (box.body.left + box.body.right) / 2) < 60, JSON.stringify(box.language));

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await popup.screenshot({ path: process.env.POPUP_SHOT || undefined });
    await ctx.close();
    finish();
});
