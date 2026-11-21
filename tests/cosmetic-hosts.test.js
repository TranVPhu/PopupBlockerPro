// Bộ lọc ABPVN/EasyList ghi tên miền kèm "www." (VD: www.youtube.com trong $generichide): trang www.* phải khớp đúng các luật đó
const http = require('http');
const { eventually, launchExtension, createChecker, runTest } = require('./helpers');

const { check, finish } = createChecker();

// #pc-bill-top: luật riêng của www.saostar.vn; .ads: luật của saostar.vn; #banner-top: luật chung (tắt ở www.tiengnhatdongian.com)
const PAGE = `<!doctype html><meta charset="utf-8"><title>t</title>
    <div id="pc-bill-top">www-only</div>
    <div class="ads">domain</div>
    <div id="banner-top">generic</div>`;

runTest(async () => {
    const server = http.createServer((_, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(PAGE);
    }).listen(0);
    const { ctx, swWarnings } = await launchExtension({ resolveTo: `127.0.0.1:${server.address().port}` });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const hidden = (selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display === 'none', selector);
    // Ở trang saostar.vn, .ads đã ẩn nghĩa là CSS đã được áp. Trang khác không có dấu hiệu đó: đợi cố định
    const open = async (host, { saostar = true } = {}) => {
        await page.goto(`http://${host}/`);
        await page.waitForLoadState('load');
        if (saostar) await eventually(() => hidden('.ads'));
        await page.waitForTimeout(saostar ? 500 : 2000);
    };

    await open('www.saostar.vn');
    check('www.* page gets the rules written for www.*', await hidden('#pc-bill-top'));
    check('www.* page gets the rules of its parent domain', await hidden('.ads'));
    check('www.* page gets the generic rules', await hidden('#banner-top'));

    await open('saostar.vn');
    check('bare domain does not get the rules written for www.*', !(await hidden('#pc-bill-top')));
    check('bare domain gets its own rules', await hidden('.ads'));

    await open('www.tiengnhatdongian.com', { saostar: false });
    check('$generichide written with www. turns the generic rules off', !(await hidden('#banner-top')));

    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no background warnings', swWarnings.length === 0, swWarnings.join(' | ').slice(0, 300));
    await ctx.close();
    server.close();
    finish();
});
