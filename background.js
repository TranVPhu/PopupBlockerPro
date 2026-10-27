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

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    if (!isEnabled) return;
    try {
        const sourceTab = await chrome.tabs.get(details.sourceTabId);
        if (!sourceTab || !sourceTab.url) return;

        const sourceHost = new URL(sourceTab.url).hostname;
        if (isHostWhitelisted(sourceHost)) return;

        const targetHost = new URL(details.url).hostname;
        if (details.url.startsWith('chrome://') || details.url.startsWith('edge://')) return;

        if (sourceHost !== targetHost && details.url !== 'about:blank') {
            await chrome.tabs.remove(details.tabId);
            blockedCount++;
            chrome.storage.local.set({ blockedCount });
        }
    } catch (error) { }
});

chrome.tabs.onCreated.addListener(async (tab) => {
    if (!isEnabled || !tab.openerTabId) return;
    try {
        const openerTab = await chrome.tabs.get(tab.openerTabId);
        if (openerTab && openerTab.url) {
            const openerHost = new URL(openerTab.url).hostname;
            if (isHostWhitelisted(openerHost)) return;
        }

        if (tab.pendingUrl === 'about:blank' || tab.url === 'about:blank') {
            chrome.tabs.remove(tab.id).catch(() => { });
            blockedCount++;
            chrome.storage.local.set({ blockedCount });
        }
    } catch (error) { }
});