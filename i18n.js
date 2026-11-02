// Giao diện hai ngôn ngữ. Không dùng chrome.i18n vì nó chỉ theo ngôn ngữ trình duyệt, không đổi được lúc đang chạy
const PB_STRINGS = {
    vi: {
        languageLabel: '🌐 Ngôn ngữ',
        statThisPage: '🛡️ Trang này',
        statAllSites: '🌐 Toàn hệ thống',
        domainChecking: 'Đang kiểm tra tên miền...',
        domainSystemPage: 'Trang hệ thống trình duyệt',
        domainTrusted: '✅ Đã tin cậy: {host}',
        domainPaused: '⏸️ Đang tạm bỏ chặn: {host}',
        domainProtected: '🔒 Đang bảo vệ: {host}',
        toggleOn: 'ĐANG BẬT TOÀN HỆ THỐNG',
        toggleOff: 'ĐÃ TẠM TẮT TOÀN HỆ THỐNG',
        pauseFor: '⏸️ Tạm bỏ chặn trang này ({minutes} phút)',
        resumeNow: '▶️ Chặn lại ngay (còn {minutes} phút)',
        whitelistAdd: 'Cho phép trang này (Whitelist)',
        whitelistRemove: 'Gỡ khỏi Danh sách trắng (Whitelist)',
        restoreDefault: '♻️ Khôi phục phần tử đã ẩn',
        restoreCount: '♻️ Khôi phục {count} phần tử đã ẩn',
        pickerBtn: '🎯 Rà chọn ẩn',
        pickerTitle: 'Chọn phần tử bằng chuột để ẩn vĩnh viễn',
        zapperBtn: '⚡ Tẩy nhanh',
        zapperTitle: 'Click ẩn nhanh phần tử ngay lập tức (không lưu)',
        qrBtn: '📱 Tạo mã QR cho trang này',
        qrBtnTitle: 'Tạo mã QR cho đường link của trang này',
        donateLink: '☕ Ủng hộ tác giả',
        privacyLink: 'Quyền riêng tư & giấy phép',
        logoAlt: 'Logo Popup & Overlay Blocker',
        qrPageTitle: 'Tạo mã QR',
        qrHeading: '📱 Tạo mã QR',
        qrBack: 'Quay lại',
        qrCanvasLabel: 'Mã QR của đường link',
        qrInputLabel: 'Đường link cần tạo mã QR',
        qrPlaceholder: 'Dán đường link vào đây...',
        qrDownload: '⬇️ Tải ảnh PNG',
        qrCopy: '📋 Sao chép ảnh',
        qrCopied: '✅ Đã sao chép',
        qrCopyFailed: '❌ Không sao chép được',
        qrEmpty: 'Dán đường link vào ô bên dưới để tạo mã QR.',
        qrTooLong: 'Đường link quá dài, không thể tạo mã QR.',
        donatePageTitle: 'Ủng hộ tác giả',
        donateHeading: '☕ Ủng hộ tác giả',
        donateIntro: 'Tiện ích này miễn phí. Nếu thấy hữu ích, bạn có thể ủng hộ tùy tâm bằng cách quét mã trong ứng dụng MoMo.',
        donateAlt: 'Mã QR MoMo để ủng hộ tác giả',
        donateNote: 'Ủng hộ là tự nguyện và không mở thêm tính năng. Giao dịch diễn ra trong MoMo giữa bạn và tác giả, không qua Google, và tiện ích không nhận được thông tin thanh toán của bạn.',
        privacyPageTitle: 'Quyền riêng tư và giấy phép',
        zapperBanner: '⚡ Tẩy nhanh (Zapper): Click vào phần tử để ẩn ngay lập tức | [ESC] Thoát',
        pickerBanner: '🎯 Bộ chọn phần tử: Click để ẩn | [↑] Chọn phần tử cha | [↓] Chọn phần tử con | [ESC] Thoát',
        menuHide: '🚫 Ẩn phần tử này (Lưu bộ lọc)',
        menuZap: '⚡ Tẩy nhanh phần tử này (Zapper - không lưu)',
        menuPick: '🎯 Bật chế độ rà chuột chọn vùng cần ẩn',
        menuReset: '♻️ Khôi phục các phần tử đã ẩn trên trang này',
        menuQr: '📱 Tạo mã QR cho liên kết này'
    },
    en: {
        languageLabel: '🌐 Language',
        statThisPage: '🛡️ This page',
        statAllSites: '🌐 All sites',
        domainChecking: 'Checking this site...',
        domainSystemPage: 'Browser system page',
        domainTrusted: '✅ Trusted: {host}',
        domainPaused: '⏸️ Paused on: {host}',
        domainProtected: '🔒 Protecting: {host}',
        toggleOn: 'ENABLED ON ALL SITES',
        toggleOff: 'TURNED OFF ON ALL SITES',
        pauseFor: '⏸️ Pause on this site ({minutes} min)',
        resumeNow: '▶️ Resume now ({minutes} min left)',
        whitelistAdd: 'Allow this site (Whitelist)',
        whitelistRemove: 'Remove from Whitelist',
        restoreDefault: '♻️ Restore hidden elements',
        restoreCount: '♻️ Restore {count} hidden elements',
        pickerBtn: '🎯 Pick to hide',
        pickerTitle: 'Pick an element with the mouse to hide it permanently',
        zapperBtn: '⚡ Quick hide',
        zapperTitle: 'Click an element to hide it right away (not saved)',
        qrBtn: '📱 Create QR code for this page',
        qrBtnTitle: 'Create a QR code for the link of this page',
        donateLink: '☕ Support the author',
        privacyLink: 'Privacy & licenses',
        logoAlt: 'Popup & Overlay Blocker logo',
        qrPageTitle: 'Create QR code',
        qrHeading: '📱 Create QR code',
        qrBack: 'Back',
        qrCanvasLabel: 'QR code of the link',
        qrInputLabel: 'Link to turn into a QR code',
        qrPlaceholder: 'Paste a link here...',
        qrDownload: '⬇️ Download PNG',
        qrCopy: '📋 Copy image',
        qrCopied: '✅ Copied',
        qrCopyFailed: '❌ Could not copy',
        qrEmpty: 'Paste a link in the box below to create a QR code.',
        qrTooLong: 'This link is too long for a QR code.',
        donatePageTitle: 'Support the author',
        donateHeading: '☕ Support the author',
        donateIntro: 'This extension is free. If you find it useful, you can send any amount by scanning the code in the MoMo app.',
        donateAlt: 'MoMo QR code to support the author',
        donateNote: 'Donations are voluntary and unlock nothing. They take place in MoMo between you and the author, not through Google, and the extension receives no payment information.',
        privacyPageTitle: 'Privacy and licenses',
        zapperBanner: '⚡ Quick hide (Zapper): Click an element to hide it right away | [ESC] Exit',
        pickerBanner: '🎯 Element picker: Click to hide | [↑] Select parent | [↓] Select child | [ESC] Exit',
        menuHide: '🚫 Hide this element (save rule)',
        menuZap: '⚡ Quick hide this element (Zapper - not saved)',
        menuPick: '🎯 Pick an area to hide with the mouse',
        menuReset: '♻️ Restore hidden elements on this page',
        menuQr: '📱 Create QR code for this link'
    }
};

// privacy.html còn được đăng trên web công khai, nơi không có API của extension
const PB_IN_EXTENSION = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.i18n;

// Đã chọn thì theo lựa chọn. Chưa chọn thì theo trình duyệt: tiếng Việt cho người dùng Việt, còn lại tiếng Anh
function pbResolveLanguage(stored, uiLanguage) {
    if (Object.prototype.hasOwnProperty.call(PB_STRINGS, stored)) return stored;
    return /^vi\b/i.test(uiLanguage || '') ? 'vi' : 'en';
}

let pbCurrentLanguage = pbResolveLanguage(null, PB_IN_EXTENSION ? chrome.i18n.getUILanguage() : '');

function pbSetLanguage(stored) {
    pbCurrentLanguage = pbResolveLanguage(stored, PB_IN_EXTENSION ? chrome.i18n.getUILanguage() : '');
}

function pbLoadLanguage() {
    if (!PB_IN_EXTENSION) return Promise.resolve();
    return chrome.storage.local.get('language').then((res) => pbSetLanguage(res.language));
}

function pbT(key, params = {}) {
    return PB_STRINGS[pbCurrentLanguage][key].replace(/\{(\w+)\}/g, (_, name) => params[name]);
}

// Dịch các phần tử khai báo sẵn trong HTML. Luôn gán dạng văn bản nên không có nguy cơ chèn HTML
function pbApplyTranslations() {
    document.documentElement.lang = pbCurrentLanguage;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = pbT(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = pbT(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.alt = pbT(el.dataset.i18nAlt); });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', pbT(el.dataset.i18nLabel)); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = pbT(el.dataset.i18nPlaceholder); });
}
