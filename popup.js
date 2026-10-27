const toggleBtn = document.getElementById('toggleBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const pickerBtn = document.getElementById('pickerBtn');
const zapperBtn = document.getElementById('zapperBtn');
const resetBtn = document.getElementById('resetBtn');
const countSpan = document.getElementById('count');
const tabCountSpan = document.getElementById('tabCount');
const domainBox = document.getElementById('currentDomain');

let currentHost = '';
let currentTabId = null;

function renderUI(enabled, count, tabCount, whitelist, customHidden = {}) {
    countSpan.textContent = count || 0;
    if (tabCountSpan) tabCountSpan.textContent = tabCount || 0;
    toggleBtn.textContent = enabled ? 'ĐANG BẬT TOÀN HỆ THỐNG' : 'ĐÃ TẠM TẮT TOÀN HỆ THỐNG';
    toggleBtn.className = enabled ? 'btn-on' : 'btn-off';

    if (!currentHost) {
        domainBox.textContent = 'Trang hệ thống trình duyệt';
        whitelistBtn.style.display = 'none';
        pickerBtn.style.display = 'none';
        zapperBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        return;
    }

    const isWhitelisted = whitelist.some(d => currentHost === d || currentHost.endsWith('.' + d));
    domainBox.textContent = isWhitelisted ? `✅ Đã tin cậy: ${currentHost}` : `🔒 Đang bảo vệ: ${currentHost}`;
    whitelistBtn.textContent = isWhitelisted ? 'Gỡ khỏi Danh sách trắng (Whitelist)' : 'Cho phép trang này (Whitelist)';
    whitelistBtn.className = isWhitelisted ? 'btn-wl-remove' : 'btn-wl-add';

    const hiddenCount = (customHidden[currentHost] || []).length;
    if (hiddenCount > 0) {
        resetBtn.style.display = 'flex';
        resetBtn.textContent = `♻️ Khôi phục ${hiddenCount} phần tử đã ẩn`;
    } else {
        resetBtn.style.display = 'none';
    }
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
        currentHost = new URL(tabs[0].url).hostname.replace(/^www\./, '');
        currentTabId = tabs[0].id;
    }
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist', 'customHidden'], (res) => {
        chrome.runtime.sendMessage({ action: 'get_tab_stats', tabId: currentTabId }, (resp) => {
            const tabCount = resp ? resp.tabCount : 0;
            renderUI(res.enabled !== false, res.blockedCount || 0, tabCount, res.whitelist || PB_DEFAULT_WHITELIST, res.customHidden || {});
        });
    });
});

toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist', 'customHidden'], (res) => {
        const nextState = !(res.enabled !== false);
        chrome.storage.local.set({ enabled: nextState }, () => {
            const currentTabCount = parseInt(tabCountSpan.textContent) || 0;
            renderUI(nextState, res.blockedCount || 0, currentTabCount, res.whitelist || PB_DEFAULT_WHITELIST, res.customHidden || {});
        });
    });
});

whitelistBtn.addEventListener('click', () => {
    if (!currentHost) return;
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist', 'customHidden'], (res) => {
        let wl = (res.whitelist || PB_DEFAULT_WHITELIST).slice();
        const exists = wl.some(d => currentHost === d || currentHost.endsWith('.' + d));
        if (exists) {
            wl = wl.filter(d => currentHost !== d && !currentHost.endsWith('.' + d));
        } else {
            wl.push(currentHost);
        }
        chrome.storage.local.set({ whitelist: wl }, () => {
            const currentTabCount = parseInt(tabCountSpan.textContent) || 0;
            renderUI(res.enabled !== false, res.blockedCount || 0, currentTabCount, wl, res.customHidden || {});
        });
    });
});

// Kích hoạt Element Picker từ popup
pickerBtn.addEventListener('click', () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { action: 'start_element_picker' }, { frameId: 0 }).catch(() => { });
    window.close();
});

// Kích hoạt Element Zapper từ popup
zapperBtn.addEventListener('click', () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { action: 'start_element_zapper' }, { frameId: 0 }).catch(() => { });
    window.close();
});

// Khôi phục các phần tử người dùng đã tự ẩn trên trang hiện tại
resetBtn.addEventListener('click', () => {
    if (!currentHost || !currentTabId) return;
    chrome.storage.local.get(['customHidden'], (res) => {
        const customHidden = res.customHidden || {};
        delete customHidden[currentHost];
        chrome.storage.local.set({ customHidden }, () => {
            chrome.tabs.reload(currentTabId);
            window.close();
        });
    });
});