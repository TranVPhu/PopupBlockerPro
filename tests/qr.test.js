const jsQR = require('jsqr');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EXT_DIR, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

async function decodeCanvas(page) {
    const img = await page.evaluate(() => {
        const c = document.getElementById('qrCanvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        return { w: c.width, h: c.height, data: Array.from(d.data) };
    });
    const res = jsQR(Uint8ClampedArray.from(img.data), img.w, img.h);
    return res ? res.data : null;
}

runTest(async () => {
    const server = http.createServer((_, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><title>t</title><a id="l" href="https://example.com/x">link</a>');
    }).listen(0);
    const port = server.address().port;

    const { ctx, sw, extId, swWarnings } = await launchExtension();
    check('extension loads, service worker starts', !!extId, extId);

    const web = await ctx.newPage();
    const webUrl = `http://localhost:${port}/trang?a=1`;
    await web.goto(webUrl);

    // Popup: mở dạng tab nền để tabs.query({active}) trả về trang web
    const popup = await ctx.newPage();
    const pageErrors = [];
    popup.on('pageerror', e => pageErrors.push(e.message));
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await web.bringToFront();
    await popup.reload();
    await popup.waitForFunction(() => document.getElementById('currentDomain').textContent.includes('localhost'), null, { timeout: 5000 });
    check('popup shows QR button on http page', await popup.isVisible('#qrBtn'));
    await popup.setViewportSize({ width: 280, height: 420 });

    await popup.evaluate(() => document.getElementById('qrBtn').click());
    await popup.waitForURL(/qr\.html/);
    await popup.waitForSelector('#qrCanvas');
    check('QR button opens qr.html with current url', (await popup.inputValue('#linkInput')) === webUrl);
    check('QR decodes to current url', (await decodeCanvas(popup)) === webUrl);
    check('back button visible from popup', await popup.isVisible('#backBtn'));
    await popup.setViewportSize({ width: 280, height: 500 });
    await popup.click('#backBtn');
    await popup.waitForURL(/popup\.html/);
    check('back returns to popup', true);

    // Trang QR độc lập
    const qr = await ctx.newPage();
    qr.on('pageerror', e => pageErrors.push(e.message));
    await qr.goto(`chrome-extension://${extId}/qr.html?url=${encodeURIComponent('https://www.example.com/a?b=1&c=2#d')}`);
    check('standalone: url with &,# survives encoding', (await decodeCanvas(qr)) === 'https://www.example.com/a?b=1&c=2#d');
    check('standalone: no back button', !(await qr.isVisible('#backBtn')));

    const vi = 'https://vi.wikipedia.org/wiki/Việt_Nam?q=đường link 🚀';
    await qr.fill('#linkInput', vi);
    check('editing regenerates, UTF-8 kept', (await decodeCanvas(qr)) === vi, JSON.stringify(await decodeCanvas(qr)));

    const long = 'https://example.com/' + 'a'.repeat(2000);
    await qr.fill('#linkInput', long);
    const longOut = await decodeCanvas(qr);
    check('2000-char url decodes', longOut === long);
    check('png at least 512px', await qr.evaluate(() => document.getElementById('qrCanvas').width >= 512));

    await qr.fill('#linkInput', 'https://example.com/' + 'a'.repeat(3000));
    check('overflow: message shown, canvas hidden', await qr.isVisible('#message') && !(await qr.isVisible('#qrCanvas')), await qr.textContent('#message'));
    check('overflow: buttons disabled', await qr.isDisabled('#downloadBtn') && await qr.isDisabled('#copyBtn'));

    await qr.fill('#linkInput', '   ');
    check('empty: message shown', await qr.isVisible('#message'), await qr.textContent('#message'));

    await qr.fill('#linkInput', 'https://www.example.com/dl');
    check('recovers after error', (await decodeCanvas(qr)) === 'https://www.example.com/dl' && await qr.isEnabled('#downloadBtn'));

    const [dl] = await Promise.all([qr.waitForEvent('download'), qr.click('#downloadBtn')]);
    const dlPath = await dl.path();
    check('download filename', dl.suggestedFilename() === 'qr-example.com.png', dl.suggestedFilename());
    check('download is PNG', fs.readFileSync(dlPath).subarray(1, 4).toString() === 'PNG');

    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `chrome-extension://${extId}` }).catch(() => { });
    await qr.bringToFront();
    await qr.click('#copyBtn');
    await qr.waitForFunction(() => /Đã sao chép|Không sao chép/.test(document.getElementById('copyBtn').textContent));
    const label = await qr.textContent('#copyBtn');
    check('copy image', label.includes('Đã sao chép'), label);
    await qr.waitForFunction(() => document.getElementById('copyBtn').textContent.includes('Sao chép ảnh'), null, { timeout: 3000 });
    check('copy label restored', true);

    // Không tạo QR ở trang rỗng tham số
    const empty = await ctx.newPage();
    await empty.goto(`chrome-extension://${extId}/qr.html`);
    check('no url param: prompt shown', await empty.isVisible('#message'));

    // Menu chuột phải: không bấm được menu native, nên gọi đúng hành động mà handler thực hiện
    const dispatched = await sw.evaluate((u) => {
        if (chrome.contextMenus.onClicked.dispatch) {
            chrome.contextMenus.onClicked.dispatch({ menuItemId: 'create_link_qr', linkUrl: u }, { id: 1 });
            return true;
        }
        return false;
    }, 'https://example.com/menu?x=1&y=2');
    if (dispatched) {
        const win = await ctx.waitForEvent('page', { timeout: 5000 });
        await win.waitForSelector('#qrCanvas');
        check('context menu handler opens window for link', (await decodeCanvas(win)) === 'https://example.com/menu?x=1&y=2', win.url());
    } else {
        console.log('SKIP  context menu dispatch unavailable');
    }

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    check('no service worker errors', swWarnings.length === 0, swWarnings.join(' | '));
    await ctx.close();
    server.close();
    finish();
});
