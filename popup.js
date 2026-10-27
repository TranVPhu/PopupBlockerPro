const toggleBtn = document.getElementById('toggleBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const countSpan = document.getElementById('count');
const domainBox = document.getElementById('currentDomain');

let currentHost = '';

function renderUI(enabled, count, whitelist) {
    countSpan.textContent = count || 0;
    toggleBtn.textContent = enabled ? 'ĐANG BẬT TOÀN HỆ THỐNG' : 'ĐÃ TẠM TẮT TOÀN HỆ THỐNG';
    toggleBtn.className = enabled ? 'btn-on' : 'btn-off';

    if (!currentHost) {
        domainBox.textContent = 'Trang hệ thống trình duyệt';
        whitelistBtn.style.display = 'none';
        return;
    }

    const isWhitelisted = whitelist.some(d => currentHost === d || currentHost.endsWith('.' + d));
    domainBox.textContent = isWhitelisted ? `✅ Đã tin cậy: ${currentHost}` : `🔒 Đang bảo vệ: ${currentHost}`;
    whitelistBtn.textContent = isWhitelisted ? 'Gỡ khỏi Danh sách trắng (Whitelist)' : 'Cho phép trang này (Whitelist)';
    whitelistBtn.className = isWhitelisted ? 'btn-wl-remove' : 'btn-wl-add';
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
        currentHost = new URL(tabs[0].url).hostname.replace(/^www\./, '');
    }
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist'], (res) => {
        renderUI(res.enabled !== false, res.blockedCount || 0, res.whitelist || []);
    });
});

toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist'], (res) => {
        const nextState = !(res.enabled !== false);
        chrome.storage.local.set({ enabled: nextState }, () => {
            renderUI(nextState, res.blockedCount || 0, res.whitelist || []);
        });
    });
});

whitelistBtn.addEventListener('click', () => {
    if (!currentHost) return;
    chrome.storage.local.get(['enabled', 'blockedCount', 'whitelist'], (res) => {
        let wl = res.whitelist || [];
        const exists = wl.some(d => currentHost === d || currentHost.endsWith('.' + d));
        if (exists) {
            wl = wl.filter(d => currentHost !== d && !currentHost.endsWith('.' + d));
        } else {
            wl.push(currentHost);
        }
        chrome.storage.local.set({ whitelist: wl }, () => {
            renderUI(res.enabled !== false, res.blockedCount || 0, wl);
        });
    });
});