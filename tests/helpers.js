// Tiện ích dùng chung: nạp extension thật vào Chromium và ghi nhận kết quả kiểm tra
const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');
const path = require('path');

const EXT_DIR = path.resolve(__dirname, '..');

// Máy CI có thể chậm hơn nhiều lần: đợi đến khi điều kiện đúng thay vì đợi một khoảng cố định
async function eventually(fn, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await fn();
        if (value || Date.now() > deadline) return value;
        await new Promise((r) => setTimeout(r, 100));
    }
}

// Mọi tên miền ngoài localhost đều không ra mạng thật: resolveTo là "127.0.0.1:<cổng>" hoặc báo lỗi DNS ngay
async function launchExtension({ resolveTo = '~NOTFOUND' } = {}) {
    const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-')), {
        channel: 'chromium',
        headless: true,
        acceptDownloads: true,
        viewport: { width: 1366, height: 800 },
        locale: 'vi-VN',
        args: [
            `--disable-extensions-except=${EXT_DIR}`,
            `--load-extension=${EXT_DIR}`,
            `--host-resolver-rules=MAP * ${resolveTo}, EXCLUDE localhost`
        ]
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 30000 });
    const swWarnings = [];
    sw.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') swWarnings.push(m.text());
    });
    const extId = sw.url().split('/')[2];
    // Background tạo alarm này sau khi đã nạp xong trạng thái
    await eventually(() => sw.evaluate(() => chrome.alarms.get('pb_sync_dnr_counts').then(Boolean)), 30000);
    // Playwright tạm dừng tab mới để gắn debugger. Đóng tab đúng lúc đó làm renderer của trang nguồn treo vĩnh viễn.
    // Người dùng thật không có debugger nên không gặp (no-debugger.test.js kiểm tra việc này), ở đây chỉ hoãn lệnh đóng.
    await sw.evaluate(() => {
        const remove = chrome.tabs.remove.bind(chrome.tabs);
        chrome.tabs.remove = async (tabId) => {
            for (let i = 0; i < 200; i++) {
                const tab = await chrome.tabs.get(tabId).catch(() => null);
                if (!tab || tab.status === 'complete') break;
                await new Promise((r) => setTimeout(r, 50));
            }
            return remove(tabId);
        };
    });
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

module.exports = { EXT_DIR, eventually, launchExtension, createChecker, sendAsPopup, runTest };
