(function () {
    const originalWindowOpen = window.open;
    const originalClick = HTMLElement.prototype.click;

    function isProtectionActive() {
        return document.documentElement && document.documentElement.dataset.pbActive !== 'false';
    }

    // 1. Ghi đè window.open (Tự động cho phép nếu trang nằm trong Whitelist)
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

    // 2. Chặn tự động gọi .click() vào thẻ <a> ẩn bằng JS
    HTMLElement.prototype.click = function () {
        if (isProtectionActive() && this.tagName === 'A' && (this.target === '_blank' || !this.isConnected)) {
            console.log('[Popup Blocker Pro] Đã chặn JS tự động click:', this.href);
            return;
        }
        return originalClick.apply(this, arguments);
    };

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
})();