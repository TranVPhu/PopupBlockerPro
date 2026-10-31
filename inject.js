(function () {
    const originalWindowOpen = window.open;
    const originalClick = HTMLElement.prototype.click;

    // Kênh handshake bảo mật riêng giữa inject.js (MAIN) và bridge.js (ISOLATED)
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

    // Báo cho bridge.js chuyển tiếp tới background để cập nhật bộ đếm & badge
    function reportBlocked() {
        window.dispatchEvent(new CustomEvent('__pb_blocked_' + sessionSecret));
    }

    // Biến quản lý số lượng popup mở trong cùng một cử chỉ click (chống Popup Flooding) - dùng chung cho mọi frame
    let lastPopupTimestamp = 0;

    // 1. Ghi đè & Kiểm soát window.open thông minh (Học hỏi từ uBlock Origin)
    // Bọc bằng Proxy để Function.prototype.toString vẫn trả về "[native code]", trang khó nhận biết extension
    function createGuardedOpen(targetWin, nativeOpen) {
        return new Proxy(nativeOpen, {
            apply(_, __, args) {
            const url = args[0];
            if (!isProtectionActive()) {
                return Reflect.apply(nativeOpen, targetWin, args);
            }

            // Kiểm tra cử chỉ người dùng qua navigator.userActivation (chuẩn Chromium)
            const hasUserGesture = navigator.userActivation && navigator.userActivation.isActive;
            const now = Date.now();

            // Nếu KHÔNG có cử chỉ bấm chuột từ người dùng -> Chặn 100% (Popunder, Timer popup)
            if (!hasUserGesture) {
                console.log('[Popup Blocker Pro] Đã chặn popup tự kích hoạt (Không có user gesture):', url);
                reportBlocked();
                return createDummyWindow();
            }

            // Chống Popup Flood: Người dùng bấm 1 cái nhưng trang web gọi window.open hàng loạt (>= 2 lần trong 800ms)
            if (now - lastPopupTimestamp < 800) {
                console.log('[Popup Blocker Pro] Đã chặn popup liên tiếp (Popup Flood):', url);
                reportBlocked();
                return createDummyWindow();
            }

            // Chặn các URL nguy hiểm hoặc rác
            if (url) {
                const trimmedUrl = String(url).trim().toLowerCase();
                if (trimmedUrl.startsWith('javascript:') || trimmedUrl === '#' || trimmedUrl === 'data:text/html') {
                    console.log('[Popup Blocker Pro] Đã chặn popup URL đáng ngờ:', url);
                    reportBlocked();
                    return createDummyWindow();
                }
            }

            // Ghi nhận thời điểm mở popup hợp lệ (OAuth Google/Facebook, Print, Xem trước)
            lastPopupTimestamp = now;

            // Chống chiêu trò Popunder (làm mờ popup ngay sau khi mở)
            try {
                const realWin = Reflect.apply(nativeOpen, targetWin, args);
                if (realWin) {
                    try {
                        realWin.focus();
                    } catch (_) { }
                }
                return realWin;
            } catch (err) {
                return createDummyWindow();
            }
            }
        });
    }

    function lockWindowOpen(win, nativeOpen) {
        Object.defineProperty(win, 'open', {
            configurable: false,
            writable: false,
            value: createGuardedOpen(win, nativeOpen)
        });
    }

    lockWindowOpen(window, originalWindowOpen);

    // 1b. Chống lách qua iframe rỗng (about:blank): iframe.contentWindow.open(...) dùng window.open gốc của frame con.
    // Content script có thể chưa kịp chạy trong frame vừa tạo, nên khóa window.open của frame con ngay khi trang truy cập nó.
    function guardFrameWindow(win) {
        if (!win || win === window) return;
        try {
            const nativeOpen = win.open; // Frame khác origin sẽ ném SecurityError -> bỏ qua
            lockWindowOpen(win, nativeOpen); // Đã khóa rồi (non-configurable) sẽ ném TypeError -> bỏ qua
        } catch (_) { }
    }

    [window.HTMLIFrameElement, window.HTMLFrameElement, window.HTMLObjectElement].forEach(function (Ctor) {
        if (!Ctor) return;
        const winDesc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'contentWindow');
        if (winDesc && winDesc.get) {
            Object.defineProperty(Ctor.prototype, 'contentWindow', {
                configurable: winDesc.configurable,
                enumerable: winDesc.enumerable,
                get: new Proxy(winDesc.get, {
                    apply(nativeGet, thisArg) {
                        const win = Reflect.apply(nativeGet, thisArg, []);
                        guardFrameWindow(win);
                        return win;
                    }
                })
            });
        }
        const docDesc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'contentDocument');
        if (docDesc && docDesc.get) {
            Object.defineProperty(Ctor.prototype, 'contentDocument', {
                configurable: docDesc.configurable,
                enumerable: docDesc.enumerable,
                get: new Proxy(docDesc.get, {
                    apply(nativeGet, thisArg) {
                        const doc = Reflect.apply(nativeGet, thisArg, []);
                        if (doc) guardFrameWindow(doc.defaultView);
                        return doc;
                    }
                })
            });
        }
    });

    function createDummyWindow() {
        return {
            closed: false,
            focus: function () { },
            blur: function () { },
            close: function () { },
            postMessage: function () { },
            location: { href: '', replace: function () { }, reload: function () { } },
            document: { write: function () { }, open: function () { }, close: function () { } }
        };
    }

    // 2. Chặn tự động click vào thẻ <a> ẩn NHƯNG không chặn tải file blob/data/download
    Object.defineProperty(HTMLElement.prototype, 'click', {
        configurable: false,
        writable: false,
        value: new Proxy(originalClick, {
            apply(nativeClick, element, args) {
                if (isProtectionActive() && element && element.tagName === 'A') {
                    const href = element.getAttribute('href') || '';
                    const isDownload = element.hasAttribute('download') ||
                        href.startsWith('blob:') ||
                        href.startsWith('data:');

                    // Cho phép 100% các hành vi xuất/tải file từ web app (Google Docs, Canvas, Excel, PDF...)
                    if (isDownload) {
                        return Reflect.apply(nativeClick, element, args);
                    }

                    const hasUserGesture = navigator.userActivation && navigator.userActivation.isActive;
                    // Nếu JS tự động bấm vào link mở tab mới mà không có tương tác người dùng -> Chặn!
                    if (!hasUserGesture && (element.target === '_blank' || !element.isConnected)) {
                        console.log('[Popup Blocker Pro] Đã chặn JS tự động click mở tab ẩn:', href);
                        reportBlocked();
                        return;
                    }
                }
                return Reflect.apply(nativeClick, element, args);
            }
        })
    });

    // 3. Chặn sự kiện click giả mạo & Chống Reverse Tabnabbing (Tab Hijacking)
    window.addEventListener('click', function (e) {
        if (!isProtectionActive()) return;

        const anchor = e.target instanceof Element ? e.target.closest('a') : null;
        if (!anchor) return;

        // Chỉ chặn click giả lập (dispatchEvent) nhắm vào link mở tab mới.
        // Các click giả lập khác (input.click() mở hộp chọn file, dropdown của React/Vue...) phải được giữ nguyên.
        if (!e.isTrusted) {
            if (anchor.target === '_blank') {
                e.stopImmediatePropagation();
                e.preventDefault();
                reportBlocked();
            }
            return;
        }

        // Ngăn chặn Tab Hijacking: Ép buộc thêm rel="noopener noreferrer" cho mọi link target="_blank"
        if (anchor.target === '_blank') {
            const rel = (anchor.getAttribute('rel') || '').toLowerCase();
            if (!rel.includes('noopener')) {
                anchor.setAttribute('rel', (rel + ' noopener noreferrer').trim());
            }
        }

        // Chặn link target="_blank" có href là javascript: hoặc #
        if (anchor.target === '_blank' && anchor.href) {
            try {
                const targetUrl = new URL(anchor.href, window.location.href);
                if (targetUrl.protocol === 'javascript:' || anchor.getAttribute('href') === '#') {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                }
            } catch (err) { }
        }
    }, true);

    // 4. Cơ chế vô hiệu hóa thư viện phát hiện chặn quảng cáo nâng cao (Anti-Adblock Defusers)
    try {
        window.canRunAds = true;
        window.isAdBlockActive = false;
        window.adblockEnabled = false;
        window.google_ad_status = 1;

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
    const unlockScroll = () => {
        try {
            if (!isProtectionActive()) return;
            const body = document.body;
            const docEl = document.documentElement;
            if (body && (getComputedStyle(body).overflow === 'hidden' || getComputedStyle(docEl).overflow === 'hidden')) {
                const hasAdBlockOverlay = document.querySelector('[class*="adblock"], [id*="adblock"], [class*="overlay-ad"]');
                if (hasAdBlockOverlay) {
                    body.style.setProperty('overflow', 'auto', 'important');
                    docEl.style.setProperty('overflow', 'auto', 'important');
                }
            }
        } catch (err) { }
    };

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', unlockScroll);
    } else {
        unlockScroll();
    }
    setTimeout(unlockScroll, 1000);
    setTimeout(unlockScroll, 2500);
})();
