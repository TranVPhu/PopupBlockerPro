// Hằng số dùng chung cho background.js (importScripts), bridge.js (content script) và popup.js
const PB_DEFAULT_WHITELIST = ['google.com', 'youtube.com', 'facebook.com', 'github.com'];
const PB_TEMP_ALLOW_MINUTES = 30;

// Dùng cho các lỗi đáng chú ý (rule mạng, lưu trữ...), để không thất bại trong im lặng
function pbLogWarning(context) {
    return (err) => console.warn(`[Popup & Overlay Blocker] ${context}:`, err);
}

function pbHostInList(host, list) {
    return list.some(domain => host === domain || host.endsWith('.' + domain));
}

// Các trang đang được tạm bỏ chặn và chưa hết hạn. tempAllow có dạng { 'tinhte.vn': <thời điểm hết hạn ms> }
function pbActiveTempAllow(tempAllow) {
    const now = Date.now();
    return Object.keys(tempAllow || {}).filter(host => tempAllow[host] > now);
}
