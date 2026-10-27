let isEnabled = true;
let blockedCount = 0;
let whitelist = ['google.com', 'youtube.com', 'facebook.com', 'github.com'];

chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist'], (res) => {
    if (res.enabled !== undefined) isEnabled = res.enabled;
    if (res.blockedCount !== undefined) blockedCount = res.blockedCount;
    if (res.whitelist !== undefined) whitelist = res.whitelist;
    else chrome.storage.local.set({ whitelist });
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) isEnabled = changes.enabled.newValue;
    if (changes.whitelist) whitelist = changes.whitelist.newValue;
});

// --- KHỞI TẠO MENU CHUỘT PHẢI (CONTEXT MENU) ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "block_right_clicked_el",
            title: "🚫 Ẩn quảng cáo / phần tử này",
            contexts: ["all"]
        });
        chrome.contextMenus.create({
            id: "start_element_picker",
            title: "🎯 Bật chế độ rà chuột chọn phần tử cần ẩn",
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
    chrome.tabs.sendMessage(tab.id, { action: info.menuItemId }).catch(() => { });
});

// --- LOGIC CHẶN TAB POPUP ---
function isHostWhitelisted(hostname) {
    return whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

// Quản lý số lượng quảng cáo đã chặn theo từng Tab
const tabStats = {};

function updateBadge(tabId, count) {
    if (!tabId) return;
    if (!isEnabled || !count || count <= 0) {
        chrome.action.setBadgeText({ tabId: tabId, text: '' }).catch(() => { });
        return;
    }
    const badgeText = count > 999 ? '999+' : count.toString();
    chrome.action.setBadgeText({ tabId: tabId, text: badgeText }).catch(() => { });
    chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#f38ba8' }).catch(() => { });
}

function recordBlocked(tabId) {
    blockedCount++;
    chrome.storage.local.set({ blockedCount });
    if (tabId) {
        tabStats[tabId] = (tabStats[tabId] || 0) + 1;
        updateBadge(tabId, tabStats[tabId]);
    }
}

// Ghi nhận các cú click chuột tin cậy từ người dùng (tránh đóng nhầm tab)
const trustedClicks = {};

// Xóa thống kê khi đóng Tab
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStats[tabId];
    delete trustedClicks[tabId];
});

// Reset số đếm tab khi tải trang mới (top-level navigation)
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) {
        tabStats[details.tabId] = 0;
        updateBadge(details.tabId, 0);
    }
});

// Lắng nghe yêu cầu thống kê hoặc thông báo chặn từ content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'user_trusted_click' && sender.tab && sender.tab.id) {
        trustedClicks[sender.tab.id] = {
            time: msg.timestamp || Date.now(),
            url: msg.url || ''
        };
        sendResponse({ received: true });
    } else if (msg.action === 'ad_blocked' && sender.tab && sender.tab.id) {
        recordBlocked(sender.tab.id);
        sendResponse({ tabCount: tabStats[sender.tab.id], globalCount: blockedCount });
    } else if (msg.action === 'get_tab_stats') {
        const targetTabId = msg.tabId || (sender.tab ? sender.tab.id : null);
        sendResponse({
            tabCount: targetTabId ? (tabStats[targetTabId] || 0) : 0,
            globalCount: blockedCount
        });
    }
    return true;
});

// Chặn Tab tự động nhảy mở ra mà không có cử chỉ click thực của người dùng
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    if (!isEnabled) return;
    try {
        const sourceTab = await chrome.tabs.get(details.sourceTabId);
        if (!sourceTab || !sourceTab.url) return;

        const sourceHost = new URL(sourceTab.url).hostname;
        if (isHostWhitelisted(sourceHost)) return;

        const targetHost = new URL(details.url).hostname;
        if (details.url.startsWith('chrome://') || details.url.startsWith('edge://')) return;

        // Kiểm tra xem cú mở tab này có xuất phát từ thao tác click thực của người dùng không
        const trusted = trustedClicks[details.sourceTabId];
        const isUserInitiated = trusted && (Date.now() - trusted.time < 2500);

        // Nếu người dùng chủ động click mở link -> Giữ tab, KHÔNG được đóng!
        if (isUserInitiated) return;

        // Nếu KHÔNG có cử chỉ người dùng hợp lệ và mở sang domain khác hoặc link rác -> Chặn!
        if (sourceHost !== targetHost && details.url !== 'about:blank') {
            await chrome.tabs.remove(details.tabId);
            recordBlocked(details.sourceTabId);
        }
    } catch (error) { }
});