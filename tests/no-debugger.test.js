// Đóng tab popup không được làm treo trang nguồn. Các test khác hoãn lệnh đóng vì Playwright (xem helpers.js),
// nên ở đây chạy Chromium không có Playwright, CDP chỉ nối vào trang nguồn để tạo cử chỉ người dùng
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { chromium } = require('playwright');
const { EXT_DIR, eventually, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

const ROUNDS = 10;
const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <p id="blank">văn bản thường</p>
    <script>
        document.getElementById('blank').addEventListener('click', () => {
            const w = window.open('http://example.org/ad');
            fetch('/returned');
            if (!w || w.closed) return;
            const timer = setInterval(() => {
                if (w.closed) { clearInterval(timer); fetch('/closed'); }
            }, 100);
        });
        setInterval(() => fetch('/beat'), 200);
    </script>`;

runTest(async () => {
    const seen = { returned: 0, closed: 0, beat: 0 };
    const server = http.createServer((req, res) => {
        const key = req.url.slice(1);
        if (key in seen) {
            seen[key]++;
            return res.end();
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(PAGE);
    }).listen(0);
    const base = `http://localhost:${server.address().port}`;

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-'));
    const browser = spawn(chromium.executablePath(), [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        `--host-resolver-rules=MAP * 127.0.0.1:${server.address().port}, EXCLUDE localhost`,
        'about:blank'
    ], { stdio: 'ignore' });

    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    const getPort = () => {
        try {
            return fs.readFileSync(portFile, 'utf8').split('\n')[0];
        } catch (_) {
            return '';
        }
    };
    const port = await eventually(getPort, 30000);
    const listPages = () => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/json/list', agent: false }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve(JSON.parse(body).filter((t) => t.type === 'page')));
        }).on('error', reject);
    });
    const [target] = await eventually(async () => {
        const pages = await listPages();
        return pages.length > 0 && pages;
    }, 30000);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
        const data = JSON.parse(m.data);
        if (pending.has(data.id)) {
            pending.get(data.id)(data);
            pending.delete(data.id);
        }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
    });

    // Service worker cần thời gian nạp danh sách trước khi tab mới bị xét
    await new Promise((r) => setTimeout(r, 3000));
    for (let i = 0; i < ROUNDS; i++) {
        await send('Page.navigate', { url: base + '/' });
        await eventually(async () => {
            const { result } = await send('Runtime.evaluate', { expression: "!!document.getElementById('blank')", returnByValue: true });
            return result.result.value;
        });
        const returned = seen.returned;
        const closed = seen.closed;
        await send('Runtime.evaluate', { expression: "document.getElementById('blank').click()", userGesture: true });
        await eventually(() => seen.returned > returned && seen.closed > closed);
    }

    check('window.open returned every time', seen.returned === ROUNDS, `${seen.returned}/${ROUNDS}`);
    check('every popup really opened and was closed', seen.closed === ROUNDS, `${seen.closed}/${ROUNDS}`);
    const beat = seen.beat;
    check('source page still running', await eventually(() => seen.beat > beat));
    check('no ad tab left', (await listPages()).every((t) => !t.url.includes('example.org')));

    // Đóng hẳn mọi kết nối trước khi thoát: process.exit khi WebSocket đang đóng làm Node trên Windows bị abort
    ws.close();
    await once(ws, 'close');
    browser.kill();
    await once(browser, 'exit');
    server.closeAllConnections();
    server.close();
    finish();
});
