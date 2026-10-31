const toggleBtn = document.getElementById('toggleBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const pickerBtn = document.getElementById('pickerBtn');
const zapperBtn = document.getElementById('zapperBtn');
const qrBtn = document.getElementById('qrBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const countSpan = document.getElementById('count');
const tabCountSpan = document.getElementById('tabCount');
const domainBox = document.getElementById('currentDomain');

let currentHost = '';
let currentTabId = null;
let currentUrl = '';
let tempAllow = {};

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
        qrBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        return;
    }

    const isWhitelisted = pbHostInList(currentHost, whitelist);
    const isPaused = pbActiveTempAllow(tempAllow).includes(currentHost);
    if (isWhitelisted) {
        domainBox.textContent = `✅ Đã tin cậy: ${currentHost}`;
    } else {
        domainBox.textContent = isPaused ? `⏸️ Đang tạm bỏ chặn: ${currentHost}` : `🔒 Đang bảo vệ: ${currentHost}`;
    }

    // Tạm bỏ chặn chỉ có ý nghĩa khi trang đang được bảo vệ
    pauseBtn.style.display = enabled && !isWhitelisted ? 'flex' : 'none';
    if (isPaused) {
        const minutesLeft = Math.ceil((tempAllow[currentHost] - Date.now()) / 60000);
        pauseBtn.textContent = `▶️ Chặn lại ngay (còn ${minutesLeft} phút)`;
        pauseBtn.className = 'btn-resume';
    } else {
        pauseBtn.textContent = `⏸️ Tạm bỏ chặn trang này (${PB_TEMP_ALLOW_MINUTES} phút)`;
        pauseBtn.className = 'btn-pause';
    }

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
        currentUrl = tabs[0].url;
    }
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist', 'tempAllow', 'customHidden'], (res) => {
        tempAllow = res.tempAllow || {};
        chrome.runtime.sendMessage({ action: 'get_tab_stats', tabId: currentTabId }, (resp) => {
            const tabCount = resp ? resp.tabCount : 0;
            const globalCount = resp ? resp.globalCount : (res.blockedCount || 0);
            renderUI(res.enabled !== false, globalCount, tabCount, res.whitelist || PB_DEFAULT_WHITELIST, res.customHidden || {});
        });
    });
});

toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['enabled', 'whitelist', 'customHidden'], (res) => {
        const nextState = !(res.enabled !== false);
        chrome.storage.local.set({ enabled: nextState }, () => {
            const currentTabCount = parseInt(tabCountSpan.textContent) || 0;
            renderUI(nextState, countSpan.textContent, currentTabCount, res.whitelist || PB_DEFAULT_WHITELIST, res.customHidden || {});
        });
    });
});

whitelistBtn.addEventListener('click', () => {
    if (!currentHost) return;
    chrome.storage.local.get(['enabled', 'whitelist', 'customHidden'], (res) => {
        let wl = (res.whitelist || PB_DEFAULT_WHITELIST).slice();
        const exists = wl.some(d => currentHost === d || currentHost.endsWith('.' + d));
        if (exists) {
            wl = wl.filter(d => currentHost !== d && !currentHost.endsWith('.' + d));
        } else {
            wl.push(currentHost);
        }
        chrome.storage.local.set({ whitelist: wl }, () => {
            const currentTabCount = parseInt(tabCountSpan.textContent) || 0;
            renderUI(res.enabled !== false, countSpan.textContent, currentTabCount, wl, res.customHidden || {});
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

// Tạm bỏ chặn trang hiện tại (hoặc chặn lại ngay), rồi tải lại trang để áp dụng
pauseBtn.addEventListener('click', () => {
    if (!currentHost || !currentTabId) return;
    const isPaused = pbActiveTempAllow(tempAllow).includes(currentHost);
    chrome.runtime.sendMessage({
        action: 'set_temp_allow',
        host: currentHost,
        minutes: isPaused ? 0 : PB_TEMP_ALLOW_MINUTES
    }, () => {
        chrome.tabs.reload(currentTabId);
        window.close();
    });
});

// Link ủng hộ chỉ hiện khi gói cài đặt có ảnh mã MoMo
fetch(chrome.runtime.getURL('momo-qr.png')).then((resp) => {
    if (resp.ok) document.getElementById('donateLink').hidden = false;
}).catch(() => { });

// Mở trang tạo mã QR ngay trong popup cho đường link hiện tại
qrBtn.addEventListener('click', () => {
    if (!currentUrl) return;
    window.location.href = `qr.html?from=popup&url=${encodeURIComponent(currentUrl)}`;
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