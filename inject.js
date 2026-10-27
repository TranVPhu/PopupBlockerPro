(function () {
    const originalWindowOpen = window.open;
    const originalClick = HTMLElement.prototype.click;

    // Kênh handshake bảo mật riêng giữa inject.js (MAIN) và bridge.js (ISOLATED)
    // Không dùng thuộc tính DOM mở (dataset) để tránh bị script trang web sửa đổi
    let isSiteProtected = true;
    const sessionSecret = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : ('pb_' + Math.random().toString(36).substring(2) + Date.now().toString(36));

    window.addEventListener('__pb_sync_' + sessionSecret, function (e) {
        if (e.detail && typeof e.detail.active === 'boolean') {
            isSiteProtected = e.detail.active;
        }
    });

    window.dispatchEvent(new CustomEvent('__pb_handshake__', { detail: { token: sessionSecret } }));

    function isProtectionActive() {
        return isSiteProtected;
    }

    // 1. Ghi đè & Khóa window.open (chống ghi đè từ webpage)
    Object.defineProperty(window, 'open', {
        configurable: false,
        writable: false,
        value: function (url, target, features) {
            if (!isProtectionActive()) {
                return originalWindowOpen.apply(window, arguments);
            }
            console.log('[Popup Blocker Pro] Đã chặn window.open:', url);
            return {
                closed: false,
                focus: function () { },
                blur: function () { },
                close: function () { },
                document: { write: function () { }, open: function () { }, close: function () { } }
            };
        }
    });

    // 2. Chặn & Khóa tự động gọi .click() vào thẻ <a> ẩn bằng JS (chống xóa/ghi đè prototype)
    Object.defineProperty(HTMLElement.prototype, 'click', {
        configurable: false,
        writable: false,
        value: function () {
            if (isProtectionActive() && this.tagName === 'A' && (this.target === '_blank' || !this.isConnected)) {
                console.log('[Popup Blocker Pro] Đã chặn JS tự động click:', this.href);
                return;
            }
            return originalClick.apply(this, arguments);
        }
    });

    // 3. Chặn sự kiện click giả mạo hoặc link trống mở tab mới
    window.addEventListener('click', function (e) {
        if (!isProtectionActive()) return;

        if (!e.isTrusted) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return false;
        }

        const anchor = e.target.closest('a');
        if (anchor && anchor.target === '_blank' && anchor.href) {
            try {
                const targetUrl = new URL(anchor.href, window.location.href);
                if (targetUrl.protocol === 'javascript:' || anchor.getAttribute('href') === '#') {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                }
            } catch (err) { }
        }
    }, true);

    // 4. Cơ chế vô hiệu hóa thư viện phát hiện chặn quảng cáo (Anti-Adblock Defuser)
    try {
        window.canRunAds = true;
        window.isAdBlockActive = false;
        window.adblockEnabled = false;

        const fakeFab = {
            check: function () { return false; },
            clearEvent: function () { return this; },
            on: function (detected, fn) {
                if (!detected && typeof fn === 'function') fn();
                return this;
            },
            onDetected: function () { return this; },
            onNotDetected: function (fn) {
                if (typeof fn === 'function') setTimeout(fn, 1);
                return this;
            },
            setOption: function () { return this; }
        };

        window.fuckAdBlock = fakeFab;
        window.FuckAdBlock = fakeFab;
        window.blockAdBlock = fakeFab;
        window.BlockAdBlock = fakeFab;
        window.snigelPubConf = window.snigelPubConf || {};
    } catch (e) { }

    // 5. Tự động giải phóng thanh cuộn nếu website cố tình khóa scroll khi phát hiện chặn quảng cáo
    window.addEventListener('DOMContentLoaded', function () {
        if (!isProtectionActive()) return;
        const unlockScroll = () => {
            try {
                if (document.body && (getComputedStyle(document.body).overflow === 'hidden' || document.documentElement.style.overflow === 'hidden')) {
                    const hasAdBlockOverlay = document.querySelector('[class*="adblock"], [id*="adblock"], [class*="overlay-ad"]');
                    if (hasAdBlockOverlay) {
                        document.body.style.setProperty('overflow', 'auto', 'important');
                        document.documentElement.style.setProperty('overflow', 'auto', 'important');
                    }
                }
            } catch (err) { }
        };
        setTimeout(unlockScroll, 800);
        setTimeout(unlockScroll, 2000);
    });
})();