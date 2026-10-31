// Tạm bỏ chặn phải tự hết hạn bằng alarm thật
const { eventually, launchExtension, createChecker, sendAsPopup, runTest } = require('./helpers');

const { check, finish } = createChecker();

runTest(async () => {
    const { ctx, sw } = await launchExtension();
    const state = () => sw.evaluate(async () => ({
        stored: (await chrome.storage.local.get('tempAllow')).tempAllow,
        rule: (await chrome.declarativeNetRequest.getDynamicRules()).flatMap((r) => r.condition.requestDomains || []).includes('a-test.vn'),
        alarm: !!(await chrome.alarms.get('pb_temp_allow_expiry'))
    }));

    await sendAsPopup(sw, { action: 'set_temp_allow', host: 'a-test.vn', minutes: 0.2 });
    const during = await state();
    check('paused: stored, allow rule added, alarm set', 'a-test.vn' in during.stored && during.rule && during.alarm, JSON.stringify(during));

    let after;
    await eventually(async () => {
        after = await state();
        return Object.keys(after.stored).length === 0 && !after.rule && !after.alarm;
    }, 40000);
    check('expired: stored cleared, rule removed, alarm gone', Object.keys(after.stored).length === 0 && !after.rule && !after.alarm, JSON.stringify(after));

    await ctx.close();
    finish();
});
