// Tạm bỏ chặn phải tự hết hạn bằng alarm thật
const { launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

runTest(async () => {
    const { ctx, sw } = await launchExtension();
    const state = () => sw.evaluate(async () => ({
        stored: (await chrome.storage.local.get('tempAllow')).tempAllow,
        rule: (await chrome.declarativeNetRequest.getDynamicRules()).flatMap((r) => r.condition.requestDomains || []).includes('a-test.vn'),
        alarm: !!(await chrome.alarms.get('pb_temp_allow_expiry'))
    }));

    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'a-test.vn', minutes: 0.05 });
    const during = await state();
    check('paused: stored, allow rule added, alarm set', 'a-test.vn' in during.stored && during.rule && during.alarm, JSON.stringify(during));

    await new Promise((r) => setTimeout(r, 6000));
    const after = await state();
    check('expired: stored cleared, rule removed, alarm gone', Object.keys(after.stored).length === 0 && !after.rule && !after.alarm, JSON.stringify(after));

    await ctx.close();
    finish();
});
