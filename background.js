importScripts('shared.js');

let isEnabled = true;
let blockedCount = 0;
let whitelist = PB_DEFAULT_WHITELIST.slice();
// Tên miền chuyên mở popup/popunder quảng cáo (biên dịch từ quy tắc $popup của EasyList/ABPVN)
let popupDomains = new Set();

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
    }).catch(() => { });
}

function syncDnrWhitelist(domains) {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
        const oldRuleIds = rules.filter(r => r.id >= 90000 && r.id <= 90010).map(r => r.id);
        const newRules = [];
        if (isEnabled && domains && domains.length > 0) {
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
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
            addRules: newRules
        }).catch(() => { });
    });
}

// Badge do Chrome tự đếm: gồm request bị DNR chặn + popup/tab bị chặn (cộng thêm qua tabUpdate)
function syncBadgeMode(enabled) {
    if (!chrome.declarativeNetRequest.setExtensionActionOptions) return;
    chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: enabled }).catch(() => { });
}

// Thống kê theo tab lưu trong storage.session để không bị mất khi service worker MV3 bị tắt (~30s không hoạt động)
let tabStats = {};

// Service worker có thể bị đánh thức bởi một sự kiện -> mọi xử lý phải chờ nạp xong trạng thái,
// nếu không blockedCount = 0 sẽ ghi đè lên tổng số thật trong storage.
const ready = (async () => {
    const res = await chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist']);
    if (res.enabled !== undefined) isEnabled = res.enabled;
    if (res.blockedCount !== undefined) blockedCount = res.blockedCount;
    if (res.whitelist !== undefined) whitelist = res.whitelist;
    else await chrome.storage.local.set({ whitelist });

    try {
        const session = await chrome.storage.session.get(['tabStats']);
        tabStats = session.tabStats || {};
    } catch (_) { }

    try {
        const resp = await fetch(chrome.runtime.getURL('popup_domains.json'));
        popupDomains = new Set(await resp.json());
    } catch (_) { }
})();

ready.then(() => {
    syncDnrState(isEnabled);
    syncDnrWhitelist(whitelist);
    syncBadgeMode(isEnabled);
    chrome.action.setBadgeBackgroundColor({ color: '#f38ba8' }).catch(() => { });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        syncDnrState(isEnabled);
        syncDnrWhitelist(whitelist);
        syncBadgeMode(isEnabled);
    }
    if (changes.whitelist !== undefined) {
        whitelist = changes.whitelist.newValue;
        syncDnrWhitelist(whitelist);
    }
});

// --- KHỞI TẠO MENU CHUỘT PHẢI (CONTEXT MENU) ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "block_right_clicked_el",
            title: "🚫 Ẩn phần tử này (Lưu bộ lọc)",
            contexts: ["all"]
        });
        chrome.contextMenus.create({
            id: "start_element_zapper",
            title: "⚡ Tẩy nhanh phần tử này (Zapper - không lưu)",
            contexts: ["all"]
        });
        chrome.contextMenus.create({
            id: "start_element_picker",
            title: "🎯 Bật chế độ rà chuột chọn vùng cần ẩn",
            contexts: ["all"]
        });
        chrome.contextMenus.create({
            id: "reset_custom_hidden",
            title: "♻️ Khôi phục các phần tử đã ẩn trên trang này",
            contexts: ["all"]
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab || !tab.id) return;
    // Chỉ gửi tới đúng frame được click chuột phải, tránh mọi iframe trong tab cùng nhận lệnh
    chrome.tabs.sendMessage(tab.id, { action: info.menuItemId }, { frameId: info.frameId || 0 }).catch(() => { });
});

// --- LOGIC CHẶN TAB POPUP ---
function normalizeHost(hostname) {
    return (hostname || '').replace(/^www\./, '');
}

function isHostWhitelisted(hostname) {
    if (!hostname) return false;
    return whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

function isOAuthHost(hostname) {
    if (!hostname) return false;
    return OAUTH_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
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
    if (tabId) {
        tabStats[tabId] = (tabStats[tabId] || 0) + 1;
        chrome.storage.session.set({ tabStats }).catch(() => { });
        if (isEnabled && chrome.declarativeNetRequest.setExtensionActionOptions) {
            chrome.declarativeNetRequest.setExtensionActionOptions({ tabUpdate: { tabId, increment: 1 } }).catch(() => { });
        }
    }
}

// Ghi nhận các cú click chuột tin cậy từ người dùng (tránh đóng nhầm tab)
const trustedClicks = {};
// Tab mới mở ở about:blank, chờ lần điều hướng kế tiếp để kiểm tra (chiêu mở trống rồi mới đổi location)
const pendingPopups = {};

function isUserInitiated(sourceTabId) {
    const trusted = trustedClicks[sourceTabId];
    return !!trusted && (Date.now() - trusted.time < 3000);
}

// Xóa thống kê khi đóng Tab
chrome.tabs.onRemoved.addListener((tabId) => {
    delete trustedClicks[tabId];
    delete pendingPopups[tabId];
    ready.then(() => {
        delete tabStats[tabId];
        chrome.storage.session.set({ tabStats }).catch(() => { });
    });
});

// Reset số đếm tab khi tải trang mới (top-level navigation)
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    ready.then(() => {
        tabStats[details.tabId] = 0;
        chrome.storage.session.set({ tabStats }).catch(() => { });
    });
});

// Lắng nghe yêu cầu thống kê hoặc thông báo chặn từ content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'user_trusted_click' && sender.tab && sender.tab.id) {
        trustedClicks[sender.tab.id] = {
            time: msg.timestamp || Date.now(),
            url: msg.url || ''
        };
    } else if (msg.action === 'ad_blocked' && sender.tab && sender.tab.id) {
        recordBlocked(sender.tab.id);
    } else if (msg.action === 'get_tab_stats') {
        const targetTabId = msg.tabId || (sender.tab ? sender.tab.id : null);
        ready.then(() => {
            sendResponse({
                tabCount: targetTabId ? (tabStats[targetTabId] || 0) : 0,
                globalCount: blockedCount
            });
        });
        return true;
    }
});

// Quyết định đóng hay giữ tab mới dựa trên URL đích thật sự
async function judgeNewTab(tabId, sourceTabId, sourceHost, url, userInitiated) {
    const targetHost = new URL(url).hostname;
    if (!targetHost) return;

    // Nếu là trang đăng nhập ủy quyền (Google, Microsoft, Facebook OAuth) -> Tuyệt đối không đóng!
    if (isOAuthHost(targetHost)) return;

    // Tên miền chuyên popup quảng cáo -> chặn kể cả khi có click thật (chiêu "click đâu cũng mở tab quảng cáo")
    const isKnownPopupAd = isPopupAdHost(targetHost);
    // Không có cử chỉ người dùng hợp lệ mà mở sang domain khác -> Chặn!
    const isCrossSite = normalizeHost(sourceHost) !== normalizeHost(targetHost);

    if (isKnownPopupAd || (!userInitiated && isCrossSite)) {
        await chrome.tabs.remove(tabId);
        recordBlocked(sourceTabId);
    }
}

function isBrowserInternalUrl(url) {
    return /^(chrome|edge|brave|opera|vivaldi|coccoc|chrome-extension):/i.test(url);
}

// Chặn Tab tự động nhảy mở ra mà không có cử chỉ click thực của người dùng
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    await ready;
    if (!isEnabled) return;
    try {
        const sourceTab = await chrome.tabs.get(details.sourceTabId);
        if (!sourceTab || !sourceTab.url) return;

        const sourceHost = new URL(sourceTab.url).hostname;
        if (isHostWhitelisted(sourceHost)) return;
        if (isBrowserInternalUrl(details.url)) return;

        // Kiểm tra xem cú mở tab này có xuất phát từ thao tác click thực của người dùng không
        const userInitiated = isUserInitiated(details.sourceTabId);

        // Tab mở trống rồi mới đổi location -> chờ lần điều hướng kế tiếp để biết URL thật
        if (!details.url || details.url === 'about:blank') {
            pendingPopups[details.tabId] = {
                sourceTabId: details.sourceTabId,
                sourceHost,
                userInitiated,
                time: Date.now()
            };
            return;
        }

        await judgeNewTab(details.tabId, details.sourceTabId, sourceHost, details.url, userInitiated);
    } catch (error) { }
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const pending = pendingPopups[details.tabId];
    if (!pending) return;
    if (details.url.startsWith('about:')) return;
    delete pendingPopups[details.tabId];
    if (Date.now() - pending.time > 10000 || isBrowserInternalUrl(details.url)) return;

    await ready;
    if (!isEnabled) return;
    try {
        await judgeNewTab(details.tabId, pending.sourceTabId, pending.sourceHost, details.url, pending.userInitiated);
    } catch (error) { }
});
