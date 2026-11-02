importScripts('shared.js', 'i18n.js');

let isEnabled = true;
let blockedCount = 0;
let whitelist = PB_DEFAULT_WHITELIST.slice();
// Trang đang được tạm bỏ chặn: { 'tinhte.vn': <thời điểm hết hạn ms> }. Chỉ background ghi giá trị này
let tempAllow = {};
// Tên miền chuyên mở popup/popunder quảng cáo (biên dịch từ quy tắc $popup của EasyList/ABPVN)
let popupDomains = new Set();
// Thời điểm của lượt chặn DNR mới nhất đã được cộng vào blockedCount
let dnrLastSeen = 0;

const TEMP_ALLOW_ALARM = 'pb_temp_allow_expiry';
const DNR_COUNT_ALARM = 'pb_sync_dnr_counts';
// Rule trong rules.json từ id này trở lên là ngoại lệ @@ (xem EXCEPTION_RULE_ID_START trong filter_compiler.py)
const EXCEPTION_RULE_ID_START = 100000;

// Danh sách các dịch vụ đăng nhập / ủy quyền phổ biến tránh đóng nhầm tab OAuth
const OAUTH_DOMAINS = [
    'accounts.google.com',
    'appleid.apple.com',
    'facebook.com',
    'github.com',
    'twitter.com',
    'x.com',
    'login.microsoftonline.com',
    'auth0.com'
];

function syncDnrState(enabled) {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateEnabledRulesets) return;
    chrome.declarativeNetRequest.updateEnabledRulesets({
        [enabled ? 'enableRulesetIds' : 'disableRulesetIds']: ['popup_ad_rules']
    }).catch(pbLogWarning('Không đổi được trạng thái bộ lọc'));
}

// Whitelist cố định + các trang đang tạm bỏ chặn
function getAllowedDomains() {
    return [...whitelist, ...pbActiveTempAllow(tempAllow)];
}

function syncDnrAllowRules() {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return Promise.resolve();
    // DNR từ chối cả lượt cập nhật nếu có 1 tên miền sai dạng (VD: IPv6 "[::1]"), làm mọi thay đổi whitelist về sau thất bại
    const domains = getAllowedDomains().filter(domain => /^[a-z0-9.-]+$/.test(domain));
    const newRules = [];
    if (isEnabled && domains.length > 0) {
        // Khớp theo tên miền của chính trang (requestDomains), vì trang mở từ thanh địa chỉ không có initiator
        newRules.push({
            id: 90001,
            priority: 100,
            action: { type: "allowAllRequests" },
            condition: {
                requestDomains: domains,
                resourceTypes: ["main_frame", "sub_frame"]
            }
        });
        newRules.push({
            id: 90002,
            priority: 100,
            action: { type: "allow" },
            condition: {
                initiatorDomains: domains,
                resourceTypes: ["script", "image", "xmlhttprequest", "stylesheet", "media", "font", "other"]
            }
        });
    }
    return chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [90001, 90002],
        addRules: newRules
    }).catch(pbLogWarning('Không cập nhật được rule cho phép'));
}

// Badge do Chrome tự đếm: gồm request bị DNR chặn + popup/tab bị chặn (cộng thêm qua tabUpdate)
function syncBadgeMode(enabled) {
    if (!chrome.declarativeNetRequest.setExtensionActionOptions) return;
    chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: enabled }).catch(pbLogWarning('Không đổi được chế độ badge'));
}

// Service worker có thể bị đánh thức bởi một sự kiện -> mọi xử lý phải chờ nạp xong trạng thái,
// nếu không blockedCount = 0 sẽ ghi đè lên tổng số thật trong storage.
const ready = (async () => {
    const res = await chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist', 'tempAllow', 'dnrLastSeen']);
    if (res.enabled !== undefined) isEnabled = res.enabled;
    if (res.blockedCount !== undefined) blockedCount = res.blockedCount;
    if (res.whitelist !== undefined) whitelist = res.whitelist;
    else await chrome.storage.local.set({ whitelist });
    if (res.tempAllow !== undefined) tempAllow = res.tempAllow;
    if (res.dnrLastSeen !== undefined) dnrLastSeen = res.dnrLastSeen;

    try {
        const resp = await fetch(chrome.runtime.getURL('popup_domains.json'));
        popupDomains = new Set(await resp.json());
    } catch (err) {
        pbLogWarning('Không nạp được popup_domains.json')(err);
    }
})();

ready.then(async () => {
    syncDnrState(isEnabled);
    syncBadgeMode(isEnabled);
    chrome.action.setBadgeBackgroundColor({ color: '#f38ba8' }).catch(() => { });
    await pruneTempAllow();
    // Chỉ tạo khi chưa có: tạo lại sẽ reset bộ đếm giờ, mà service worker có thể thức dậy liên tục
    if (!await chrome.alarms.get(DNR_COUNT_ALARM)) {
        chrome.alarms.create(DNR_COUNT_ALARM, { periodInMinutes: 1 });
    }
});

// --- TẠM BỎ CHẶN THEO TRANG ---
function scheduleTempAllowAlarm() {
    const expiries = Object.values(tempAllow);
    if (expiries.length > 0) {
        return chrome.alarms.create(TEMP_ALLOW_ALARM, { when: Math.min(...expiries) });
    }
    return chrome.alarms.clear(TEMP_ALLOW_ALARM);
}

async function saveTempAllow() {
    await chrome.storage.local.set({ tempAllow });
    await syncDnrAllowRules();
    await scheduleTempAllowAlarm();
}

async function pruneTempAllow() {
    const active = pbActiveTempAllow(tempAllow);
    tempAllow = Object.fromEntries(active.map(host => [host, tempAllow[host]]));
    await saveTempAllow();
}

async function setTempAllow(host, minutes) {
    await ready;
    if (minutes > 0) {
        tempAllow[host] = Date.now() + minutes * 60000;
    } else {
        delete tempAllow[host];
    }
    await saveTempAllow();
}

// --- ĐẾM LƯỢT CHẶN Ở TẦNG MẠNG (DNR) ---
// DNR chặn trong trình duyệt nên extension không nhận được sự kiện nào, phải định kỳ hỏi lại.
// Chạy nối tiếp để hai lần gọi đồng thời (alarm và popup) không cộng trùng.
let dnrCountChain = Promise.resolve();

function syncDnrCounts() {
    dnrCountChain = dnrCountChain.then(async () => {
        await ready;
        try {
            const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: dnrLastSeen + 1 });
            if (rulesMatchedInfo.length === 0) return;
            dnrLastSeen = Math.max(...rulesMatchedInfo.map(info => info.timeStamp));
            // Bỏ qua các lượt "cho phép" của whitelist (_dynamic) và ngoại lệ @@
            blockedCount += rulesMatchedInfo.filter(info =>
                info.rule.rulesetId !== '_dynamic' && info.rule.ruleId < EXCEPTION_RULE_ID_START
            ).length;
            await chrome.storage.local.set({ blockedCount, dnrLastSeen });
        } catch (err) {
            // Thường do vượt quota gọi API: lần sau đọc tiếp từ dnrLastSeen
            pbLogWarning('Không đọc được số lượt chặn')(err);
        }
    });
    return dnrCountChain;
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TEMP_ALLOW_ALARM) ready.then(pruneTempAllow);
    if (alarm.name === DNR_COUNT_ALARM) syncDnrCounts();
});

// Số "Trang này" lấy đúng số Chrome đang hiện trên icon, để hai nơi luôn khớp nhau
async function getTabBlockedCount(tabId) {
    if (!tabId) return 0;
    const text = await chrome.action.getBadgeText({ tabId }).catch(() => '');
    return parseInt(text, 10) || 0;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        syncDnrState(isEnabled);
        syncDnrAllowRules();
        syncBadgeMode(isEnabled);
    }
    if (changes.whitelist !== undefined) {
        whitelist = changes.whitelist.newValue;
        syncDnrAllowRules();
    }
    if (changes.language !== undefined) {
        pbSetLanguage(changes.language.newValue);
        MENU_ITEMS.forEach(({ id, key }) => {
            chrome.contextMenus.update(id, { title: pbT(key) }).catch(pbLogWarning('Không đổi được ngôn ngữ menu'));
        });
    }
});

// --- KHỞI TẠO MENU CHUỘT PHẢI (CONTEXT MENU) ---
const MENU_ITEMS = [
    { id: 'block_right_clicked_el', key: 'menuHide', contexts: ['all'] },
    { id: 'start_element_zapper', key: 'menuZap', contexts: ['all'] },
    { id: 'start_element_picker', key: 'menuPick', contexts: ['all'] },
    { id: 'reset_custom_hidden', key: 'menuReset', contexts: ['all'] },
    { id: 'create_link_qr', key: 'menuQr', contexts: ['link'] }
];

chrome.runtime.onInstalled.addListener(async () => {
    await pbLoadLanguage();
    chrome.contextMenus.removeAll(() => {
        MENU_ITEMS.forEach(({ id, key, contexts }) => {
            chrome.contextMenus.create({ id, title: pbT(key), contexts });
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'create_link_qr') {
        chrome.windows.create({
            url: `qr.html?url=${encodeURIComponent(info.linkUrl)}`,
            type: 'popup',
            width: 340,
            height: 560
        }).catch(() => { });
        return;
    }
    if (!tab || !tab.id) return;
    // Chỉ gửi tới đúng frame được click chuột phải, tránh mọi iframe trong tab cùng nhận lệnh
    chrome.tabs.sendMessage(tab.id, { action: info.menuItemId }, { frameId: info.frameId || 0 }).catch(() => { });
});

// --- LOGIC CHẶN TAB POPUP ---
// Lệnh thay đổi cấu hình chỉ nhận từ trang của extension (popup), không nhận từ content script chạy trong trang web.
// sender.url do trình duyệt điền nên tiến trình trang bị chiếm cũng không giả mạo được.
const CLICK_WINDOW_MS = 3000;
// Menu chuột phải có thể mở khá lâu trước khi người dùng chọn một mục
const CONTEXT_MENU_WINDOW_MS = 60000;
// Popup quảng cáo thường qua vài bước chuyển hướng rồi mới tới trang đích
const WATCH_WINDOW_MS = 15000;

function isFromExtensionPage(sender) {
    return !!sender.url && sender.url.startsWith(chrome.runtime.getURL(''));
}

function normalizeHost(hostname) {
    return (hostname || '').replace(/^www\./, '');
}

function isHostAllowed(hostname) {
    if (!hostname) return false;
    return pbHostInList(hostname, getAllowedDomains());
}

function isOAuthHost(hostname) {
    if (!hostname) return false;
    return pbHostInList(hostname, OAUTH_DOMAINS);
}

function isPopupAdHost(hostname) {
    let h = hostname;
    while (h) {
        if (popupDomains.has(h)) return true;
        const dot = h.indexOf('.');
        if (dot < 0) break;
        h = h.slice(dot + 1);
    }
    return false;
}

async function recordBlocked(tabId) {
    await ready;
    blockedCount++;
    chrome.storage.local.set({ blockedCount });
    if (tabId && isEnabled && chrome.declarativeNetRequest.setExtensionActionOptions) {
        chrome.declarativeNetRequest.setExtensionActionOptions({ tabUpdate: { tabId, increment: 1 } }).catch(() => { });
    }
}

// Ghi nhận các cú click chuột tin cậy từ người dùng (tránh đóng nhầm tab)
const trustedClicks = {};
// Tab mới đang được theo dõi: URL đầu tiên có thể chỉ là bước đệm (about:blank, redirect cùng tên miền) để né kiểm tra
const watchedTabs = {};
// Tab mới chưa đăng ký xong: redirect có thể hoàn tất trước đó, VD lúc service worker vừa thức dậy
const pendingWatches = {};

function isUserInitiated(tabId) {
    const trusted = trustedClicks[tabId];
    return !!trusted && trusted.interactive && (Date.now() - trusted.time < trusted.windowMs);
}

// Xóa dữ liệu theo dõi khi đóng Tab
chrome.tabs.onRemoved.addListener((tabId) => {
    delete trustedClicks[tabId];
    delete watchedTabs[tabId];
});

// Lắng nghe yêu cầu thống kê hoặc thông báo chặn từ content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg.action === 'user_trusted_click' && sender.tab && sender.tab.id) {
        trustedClicks[sender.tab.id] = {
            time: Date.now(),
            interactive: msg.interactive === true,
            windowMs: msg.contextMenu ? CONTEXT_MENU_WINDOW_MS : CLICK_WINDOW_MS
        };
    } else if (msg.action === 'ad_blocked' && sender.tab && sender.tab.id) {
        recordBlocked(sender.tab.id);
    } else if (msg.action === 'get_tab_stats') {
        const targetTabId = msg.tabId || (sender.tab ? sender.tab.id : null);
        syncDnrCounts().then(async () => {
            sendResponse({
                tabCount: await getTabBlockedCount(targetTabId),
                globalCount: blockedCount
            });
        });
        return true;
    } else if (msg.action === 'update_cosmetic_css' && sender.tab && sender.tab.id) {
        updateCosmeticCss(sender, msg).then(ok => sendResponse({ ok }));
        return true;
    } else if (msg.action === 'set_temp_allow' && typeof msg.host === 'string' && msg.host && isFromExtensionPage(sender)) {
        // Phản hồi sau khi rule mạng đã cập nhật, để popup tải lại trang đúng trạng thái mới
        setTempAllow(msg.host, msg.minutes).then(() => sendResponse({ done: true }));
        return true;
    }
});

// Chèn CSS bằng origin USER để trang không thấy, không gỡ và không ghi đè được
async function updateCosmeticCss(sender, { css, previous }) {
    const target = sender.documentId
        ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
        : { tabId: sender.tab.id, frameIds: [sender.frameId] };
    try {
        if (previous) await chrome.scripting.removeCSS({ target, css: previous, origin: 'USER' });
        if (css) await chrome.scripting.insertCSS({ target, css, origin: 'USER' });
        return true;
    } catch (_) {
        return false; // Frame đã đóng hoặc không cho chèn: content script giữ lại thẻ <style> làm dự phòng
    }
}

// Quyết định đóng hay giữ tab mới dựa trên URL đích thật sự
async function judgeNewTab(tabId, { sourceTabId, sourceHost, userInitiated }, url) {
    const targetHost = new URL(url).hostname;
    if (!targetHost) return;

    // Nếu là trang đăng nhập ủy quyền (Google, Microsoft, Facebook OAuth) -> Tuyệt đối không đóng!
    if (isOAuthHost(targetHost)) return;

    // Tên miền chuyên popup quảng cáo -> chặn kể cả khi có click thật (chiêu "click đâu cũng mở tab quảng cáo")
    const isKnownPopupAd = isPopupAdHost(targetHost);
    // Không có cử chỉ người dùng hợp lệ mà mở sang domain khác -> Chặn!
    const isCrossSite = normalizeHost(sourceHost) !== normalizeHost(targetHost);

    if (isKnownPopupAd || (!userInitiated && isCrossSite)) {
        delete watchedTabs[tabId];
        await chrome.tabs.remove(tabId);
        recordBlocked(sourceTabId);
    }
}

function isBrowserInternalUrl(url) {
    return /^(chrome|edge|brave|opera|vivaldi|coccoc|chrome-extension):/i.test(url);
}

// Chặn Tab tự động nhảy mở ra mà không có cử chỉ click thực của người dùng
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    const pending = watchNewTab(details).finally(() => {
        if (pendingWatches[details.tabId] === pending) delete pendingWatches[details.tabId];
    });
    pendingWatches[details.tabId] = pending;
});

async function watchNewTab(details) {
    await ready;
    if (!isEnabled) return;
    try {
        const sourceTab = await chrome.tabs.get(details.sourceTabId);
        if (!sourceTab || !sourceTab.url) return;

        const sourceHost = new URL(sourceTab.url).hostname;
        if (isHostAllowed(sourceHost)) return;
        if (isBrowserInternalUrl(details.url)) return;

        // Theo dõi tiếp các lần điều hướng sau, vì URL thật có thể chỉ lộ ra sau redirect hoặc sau khi đổi location
        const watch = {
            sourceTabId: details.sourceTabId,
            sourceHost,
            // Cú mở tab này có xuất phát từ thao tác có chủ đích của người dùng không
            userInitiated: isUserInitiated(details.sourceTabId),
            time: Date.now()
        };
        watchedTabs[details.tabId] = watch;

        if (details.url && details.url !== 'about:blank') {
            await judgeNewTab(details.tabId, watch, details.url);
        }
    } catch (err) {
        pbLogWarning('Không xử lý được tab mới')(err);
    }
}

// Người dùng tự gõ địa chỉ, chọn bookmark... trong tab mới thì không phải do trang web điều khiển
const USER_DRIVEN_TRANSITIONS = new Set(['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated', 'reload', 'start_page']);

// Dùng onCommitted vì sự kiện này cho biết URL cuối cùng sau mọi redirect phía server
chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    // Đọc trước khi chờ: listener phía dưới xóa dấu vết click ngay khi commit
    const userDriven = USER_DRIVEN_TRANSITIONS.has(details.transitionType) || isUserInitiated(details.tabId);
    await pendingWatches[details.tabId];
    const watch = watchedTabs[details.tabId];
    if (!watch || details.url.startsWith('about:')) return;
    if (Date.now() - watch.time > WATCH_WINDOW_MS
        || userDriven
        || isBrowserInternalUrl(details.url)) {
        delete watchedTabs[details.tabId];
        return;
    }

    await ready;
    if (!isEnabled) return;
    try {
        await judgeNewTab(details.tabId, watch, details.url);
    } catch (err) {
        pbLogWarning('Không xử lý được tab mới')(err);
    }
});

// Cú click ở trang cũ không được tính cho trang mới. Phải đăng ký SAU listener theo dõi tab ở trên,
// vì listener đó cần biết người dùng vừa bấm link trong tab trước khi dấu vết bị xóa.
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) delete trustedClicks[details.tabId];
});
