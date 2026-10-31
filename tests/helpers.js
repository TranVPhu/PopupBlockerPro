// Tiện ích dùng chung: nạp extension thật vào Chromium và ghi nhận kết quả kiểm tra
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');
const path = require('path');

const EXT_DIR = path.resolve(__dirname, '..');

async function launchExtension() {
    const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-')), {
        channel: 'chromium',
        headless: true,
        acceptDownloads: true,
        viewport: { width: 1366, height: 800 },
        locale: 'vi-VN',
        args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`]
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const swWarnings = [];
    sw.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') swWarnings.push(m.text());
    });
    const extId = sw.url().split('/')[2];
    // Đợi background nạp xong trạng thái
    await new Promise((r) => setTimeout(r, 1200));
    return { ctx, sw, extId, swWarnings };
}

function createChecker() {
    let failed = 0;
    return {
        check(name, ok, extra = '') {
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
            if (!ok) failed++;
        },
        finish() {
            console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
            process.exit(failed ? 1 : 0);
        }
    };
}

// Gọi trực tiếp handler của background như thể tin nhắn đến từ popup của extension
function sendAsPopup(sw, message) {
    return sw.evaluate((msg) => new Promise((resolve) => {
        const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') };
        chrome.runtime.onMessage.dispatch(msg, sender, resolve);
    }), message);
}

function runTest(main) {
    main().catch((e) => {
        console.error('CRASH', e);
        process.exit(2);
    });
}

module.exports = { EXT_DIR, launchExtension, createChecker, sendAsPopup, runTest };
