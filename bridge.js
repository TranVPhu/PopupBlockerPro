(function () {
    let isSiteProtected = true;
    let lastRightClickedElement = null;
    let pickerActive = false;
    let zapperActive = false;
    let hoveredElement = null;
    let elementStack = [];

    const currentHost = window.location.hostname.replace(/^www\./, '');

    const COSMETIC_CSS = `
    /* 1. Quảng cáo banner & khung popup thông thường */
    .ads-banner, .ad-banner, .banner-ads, .banner-quangcao,
    .ad-container, .ads-container, .ad-wrapper, .ads-wrapper,
    .ad-slot, .ad-box, .ads-box, .qc-banner, .box-quang-cao,
    div[id^="div-gpt-ad"], ins.adsbygoogle, iframe[id^="google_ads_iframe"],
    iframe[src*="/ads/"], iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],
    a[href*="adsterra"], a[href*="propellerads"], a[href*="mgid.com"],
    .floating-ads, .sticky-ads, .bottom-ads, .catfish-ads, #catfish-ad,
    .adblock-modal, .adblock-overlay, .adblock-backdrop, #adblock-modal,
    [class*="adblock-modal"], [id*="adblock-detector"],

    /* 2. Hộp thoại Cookie Banners & GDPR Annoyances phiền toái */
    #onetrust-consent-sdk, .onetrust-pc-dark, #onetrust-banner-sdk,
    #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay,
    .qc-cmp2-container, #didomi-host, .cc-window, .cc-banner,
    .cookie-banner, .cookie-notice, #cookie-law-info-bar,
    .iubenda-cs-visible, #iubenda-cs-banner,
    .complianz-terms, #cmplz-cookiebanner,
    div[aria-label*="cookie" i], div[id*="cookie-banner" i],
    div[class*="cookie-notice" i], div[class*="cookie-banner" i],
    div[class*="consent-banner" i], div[id*="consent-banner" i] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      pointer-events: none !important;
    }
  `;

    // 1. Lưu lại phần tử vừa được người dùng click chuột phải
    document.addEventListener('contextmenu', (e) => {
        lastRightClickedElement = e.target;
    }, true);

    // 2. Hàm tạo CSS Selector chuẩn xác cho phần tử bất kỳ
    function isUniqueSelector(selector) {
        try {
            return document.querySelectorAll(selector).length === 1;
        } catch (_) {
            return false;
        }
    }

    // Đi ngược lên cây DOM cho tới khi selector chỉ khớp đúng 1 phần tử (tránh ẩn nhầm hàng loạt phần tử giống nhau)
    function generateSelector(el) {
        if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return null;
        const path = [];
        let current = el;
        while (current && current.nodeType === 1 && current !== document.body && current !== document.documentElement) {
            let selector;
            if (current.id && !/^\d/.test(current.id) && isUniqueSelector(`#${CSS.escape(current.id)}`)) {
                selector = `#${CSS.escape(current.id)}`;
            } else {
                selector = current.nodeName.toLowerCase();
                const validClasses = Array.from(current.classList).filter(c => c && !/^[0-9]/.test(c)).slice(0, 2);
                if (validClasses.length > 0) {
                    selector += '.' + validClasses.map(c => CSS.escape(c)).join('.');
                }
                const parent = current.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children).filter(child => child.nodeName === current.nodeName);
                    if (siblings.length > 1) {
                        const idx = Array.from(parent.children).indexOf(current) + 1;
                        selector += `:nth-child(${idx})`;
                    }
                }
            }
            path.unshift(selector);
            const candidate = path.join(' > ');
            if (isUniqueSelector(candidate)) return candidate;
            current = current.parentElement;
        }
        // Mỗi cấp đã duy nhất trong phần tử cha, nên neo vào body là chắc chắn duy nhất
        if (current === document.body) {
            path.unshift('body');
            return path.join(' > ');
        }
        return null;
    }

    // 3. Áp dụng cả bộ lọc mặc định và danh sách phần tử người dùng tự ẩn
    function applyCosmeticFilter(customRulesMap = {}) {
        let styleEl = document.getElementById('pb-cosmetic-style');
        if (isSiteProtected) {
            if (!styleEl && document.documentElement) {
                styleEl = document.createElement('style');
                styleEl.id = 'pb-cosmetic-style';
                document.documentElement.appendChild(styleEl);
            }
            if (styleEl) {
                const siteSelectors = customRulesMap[currentHost] || [];
                const customCss = siteSelectors.length > 0
                    ? `\n${siteSelectors.join(', ')} { display: none !important; visibility: hidden !important; }`
                    : '';
                styleEl.textContent = COSMETIC_CSS + customCss;
            }
        } else if (styleEl) {
            styleEl.remove();
        }
    }

    // 4. Lưu phần tử bị ẩn vào bộ nhớ của tên miền hiện tại
    function saveAndHideElement(targetEl) {
        if (!targetEl || targetEl === document.body || targetEl === document.documentElement) return;
        const selector = generateSelector(targetEl);
        if (!selector) return;

        targetEl.style.setProperty('display', 'none', 'important');

        chrome.storage.local.get(['customHidden'], (res) => {
            const customHidden = res.customHidden || {};
            const hostList = customHidden[currentHost] || [];
            if (!hostList.includes(selector)) {
                hostList.push(selector);
                customHidden[currentHost] = hostList;
                chrome.storage.local.set({ customHidden }, () => {
                    applyCosmeticFilter(customHidden);
                });
            }
        });
    }

    // 5. Chế độ Element Zapper (⚡ Tẩy nhanh phần tử tức thì - không lưu rule)
    function startElementZapper() {
        if (zapperActive || pickerActive) return;
        zapperActive = true;

        const banner = document.createElement('div');
        banner.id = 'pb-zapper-banner';
        banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fab387;padding:10px 18px;border-radius:8px;z-index:2147483647;font:bold 13px sans-serif;box-shadow:0 4px 15px rgba(0,0,0,0.5);border:2px solid #fab387;pointer-events:none;user-select:none;';
        banner.textContent = '⚡ Tẩy nhanh (Zapper): Click vào phần tử để xóa ngay lập tức | [ESC] Thoát';
        document.body.appendChild(banner);

        let activeEl = null;

        function onMouseOver(e) {
            if (e.target === banner || banner.contains(e.target)) return;
            if (activeEl) activeEl.style.outline = '';
            activeEl = e.target;
            activeEl.style.outline = '3px dashed #fab387';
        }

        function onClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (activeEl && activeEl !== banner && !banner.contains(activeEl)) {
                activeEl.style.outline = '';
                // Hiệu ứng biến mất nhanh
                activeEl.style.transition = 'opacity 0.2s ease-out';
                activeEl.style.opacity = '0';
                setTimeout(() => activeEl.remove(), 200);
            }
            stopZapper();
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') stopZapper();
        }

        function stopZapper() {
            zapperActive = false;
            if (activeEl) activeEl.style.outline = '';
            banner.remove();
            window.removeEventListener('mouseover', onMouseOver, true);
            window.removeEventListener('click', onClick, true);
            window.removeEventListener('keydown', onKeyDown, true);
        }

        window.addEventListener('mouseover', onMouseOver, true);
        window.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKeyDown, true);
    }

    // 6. Chế độ Element Picker nâng cao (Hỗ trợ phím mũi tên ↑/↓ chọn phần tử cha/con)
    function startElementPicker() {
        if (pickerActive || zapperActive) return;
        pickerActive = true;
        elementStack = [];

        const banner = document.createElement('div');
        banner.id = 'pb-picker-banner';
        banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#a6e3a1;padding:10px 18px;border-radius:8px;z-index:2147483647;font:bold 13px sans-serif;box-shadow:0 4px 15px rgba(0,0,0,0.5);border:2px solid #89b4fa;pointer-events:none;user-select:none;';
        banner.textContent = '🎯 Bộ chọn phần tử: Click để ẩn | [↑] Chọn phần tử cha | [↓] Chọn phần tử con | [ESC] Thoát';
        document.body.appendChild(banner);

        function updateHighlight(el) {
            if (hoveredElement) hoveredElement.style.outline = '';
            hoveredElement = el;
            if (hoveredElement) {
                hoveredElement.style.outline = '3px solid #f38ba8';
            }
        }

        function onMouseOver(e) {
            if (e.target === banner || banner.contains(e.target)) return;
            elementStack = [e.target];
            updateHighlight(e.target);
        }

        function onClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (hoveredElement && hoveredElement !== banner && !banner.contains(hoveredElement)) {
                hoveredElement.style.outline = '';
                saveAndHideElement(hoveredElement);
            }
            stopPicker();
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                stopPicker();
            } else if (e.key === 'ArrowUp') {
                // Mở rộng vùng chọn lên thẻ cha bao bọc (giống uBlock Origin)
                if (hoveredElement && hoveredElement.parentElement && hoveredElement.parentElement !== document.body) {
                    elementStack.push(hoveredElement);
                    updateHighlight(hoveredElement.parentElement);
                }
            } else if (e.key === 'ArrowDown') {
                // Thu hẹp vùng chọn về thẻ con trước đó
                if (elementStack.length > 0) {
                    const prev = elementStack.pop();
                    updateHighlight(prev);
                }
            }
        }

        function stopPicker() {
            pickerActive = false;
            if (hoveredElement) hoveredElement.style.outline = '';
            banner.remove();
            window.removeEventListener('mouseover', onMouseOver, true);
            window.removeEventListener('click', onClick, true);
            window.removeEventListener('keydown', onKeyDown, true);
        }

        window.addEventListener('mouseover', onMouseOver, true);
        window.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKeyDown, true);
    }

    // 7. Lắng nghe lệnh từ Menu Chuột Phải hoặc Popup
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'block_right_clicked_el' && lastRightClickedElement) {
            saveAndHideElement(lastRightClickedElement);
        } else if (msg.action === 'start_element_zapper') {
            startElementZapper();
        } else if (msg.action === 'start_element_picker') {
            startElementPicker();
        } else if (msg.action === 'reset_custom_hidden') {
            chrome.storage.local.get(['customHidden'], (res) => {
                const customHidden = res.customHidden || {};
                delete customHidden[currentHost];
                chrome.storage.local.set({ customHidden }, () => {
                    window.location.reload();
                });
            });
        }
    });

    let currentSessionToken = null;

    // Lắng nghe yêu cầu handshake bảo mật từ inject.js.
    // Chỉ nhận handshake ĐẦU TIÊN (inject.js gửi ngay lúc document_start) để trang web không thể chiếm kênh bằng token giả.
    window.addEventListener('__pb_handshake__', (e) => {
        if (currentSessionToken || !e.detail || typeof e.detail.token !== 'string') return;
        currentSessionToken = e.detail.token;

        // inject.js báo đã chặn popup -> chuyển tiếp cho background đếm & cập nhật badge
        window.addEventListener('__pb_blocked_' + currentSessionToken, () => {
            chrome.runtime.sendMessage({ action: 'ad_blocked' }).catch(() => { });
        });

        window.dispatchEvent(new CustomEvent('__pb_sync_' + currentSessionToken, {
            detail: { active: isSiteProtected }
        }));
    });

    function syncProtectionState() {
        chrome.storage.local.get(['enabled', 'whitelist', 'customHidden'], (res) => {
            const globalEnabled = res.enabled !== undefined ? res.enabled : true;
            const whitelist = res.whitelist || PB_DEFAULT_WHITELIST;
            const isWhitelisted = whitelist.some(
                domain => currentHost === domain || currentHost.endsWith('.' + domain)
            );

            isSiteProtected = globalEnabled && !isWhitelisted;
            if (currentSessionToken) {
                window.dispatchEvent(new CustomEvent('__pb_sync_' + currentSessionToken, {
                    detail: { active: isSiteProtected }
                }));
            }
            applyCosmeticFilter(res.customHidden || {});
            if (isSiteProtected) {
                scanAndCleanPage();
            }
        });
    }

    syncProtectionState();
    // Chỉ đồng bộ lại khi cấu hình thay đổi (bỏ qua blockedCount tăng liên tục ở mọi frame của mọi tab)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enabled || changes.whitelist || changes.customHidden) syncProtectionState();
    });

    // 8. Theo dõi cử chỉ click chuột tin cậy của người dùng (tránh đóng nhầm tab hợp lệ)
    document.addEventListener('click', (e) => {
        if (e.isTrusted) {
            const anchor = e.target.closest('a');
            chrome.runtime.sendMessage({
                action: 'user_trusted_click',
                url: anchor && anchor.href ? anchor.href : '',
                timestamp: Date.now()
            }).catch(() => { });
        }
    }, true);

    document.addEventListener('auxclick', (e) => {
        if (e.isTrusted && e.button === 1) {
            const anchor = e.target.closest('a');
            chrome.runtime.sendMessage({
                action: 'user_trusted_click',
                url: anchor && anchor.href ? anchor.href : '',
                timestamp: Date.now()
            }).catch(() => { });
        }
    }, true);

    // 9. Dọn dẹp lớp phủ vô hình & Tự động tua Video Ads
    function scanAndCleanPage() {
        if (!isSiteProtected || !document.body) return;

        // Tự động bấm nút Bỏ qua quảng cáo video nếu có
        const skipButtons = document.querySelectorAll(
            '.jw-skip, .vjs-skip-button, .videoAdUiSkipButton, .ytp-ad-skip-button, .ytp-skip-ad-button, [class*="skip-ad"]'
        );
        skipButtons.forEach(btn => { if (btn.offsetParent !== null) btn.click(); });

        // Tự động tua hết video ads
        const adPlayers = document.querySelectorAll('.jw-flag-ads video, .vjs-ad-playing video, .ad-showing video');
        adPlayers.forEach(video => {
            if (video.duration && isFinite(video.duration) && video.currentTime < video.duration) {
                video.muted = true;
                video.currentTime = video.duration;
            }
        });

        // Chỉ tìm kiếm các phần tử nghi vấn là lớp phủ (thay vì toàn bộ DOM)
        const suspects = document.querySelectorAll(
            '[class*="overlay-ad"], [class*="ad-overlay"], [class*="backdrop-ad"], [id*="overlay-ad"], [id*="ad-backdrop"], [class*="popup-wrapper"]'
        );
        suspects.forEach(el => {
            if (el.dataset.pbChecked === 'safe' || el.id === 'pb-picker-banner' || el.id === 'pb-zapper-banner') return;
            // Không bao giờ xóa khung chứa ứng dụng chính
            if (el.id === 'root' || el.id === 'app' || el.querySelector('article, nav, form, p, input, button')) {
                el.dataset.pbChecked = 'safe';
                return;
            }
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'absolute') {
                const opacity = parseFloat(style.opacity);
                const bg = style.backgroundColor.replace(/\s+/g, '');
                const isTransparent = (bg === 'transparent' || bg === 'rgba(0,0,0,0)');
                if (opacity < 0.1 || isTransparent) {
                    el.remove();
                    return;
                }
            }
            el.dataset.pbChecked = 'safe';
        });
    }

    // Các thẻ hay được làm trong suốt có chủ đích (input file ẩn đè lên nút, canvas bản đồ, video...) -> không bao giờ xóa
    const OVERLAY_SAFE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL', 'VIDEO', 'AUDIO', 'CANVAS', 'IMG', 'SVG', 'A']);

    // Kiểm tra nhanh phần tử trực tiếp bị click (O(1)) để diệt lớp phủ tàng hình bẫy chuột
    window.addEventListener('mousedown', (e) => {
        if (!isSiteProtected) return;
        const target = e.target;
        if (!(target instanceof HTMLElement) || target === document.body || target === document.documentElement) return;
        if (target.id === 'pb-picker-banner' || target.id === 'pb-zapper-banner' || target.id === 'root' || target.id === 'app') return;
        if (OVERLAY_SAFE_TAGS.has(target.tagName)) return;

        const style = window.getComputedStyle(target);
        if (style.position !== 'fixed' && style.position !== 'absolute') return;

        // Chỉ coi là lớp phủ bẫy click khi nó rỗng và che phần lớn màn hình
        const rect = target.getBoundingClientRect();
        const coversViewport = rect.width >= window.innerWidth * 0.5 && rect.height >= window.innerHeight * 0.5;
        const isEmpty = target.children.length === 0 && target.textContent.trim().length === 0;
        if (!coversViewport || !isEmpty) return;

        const opacity = parseFloat(style.opacity);
        const bg = style.backgroundColor.replace(/\s+/g, '');
        const isTransparent = (bg === 'transparent' || bg === 'rgba(0,0,0,0)');
        if (opacity < 0.05 || (isTransparent && parseInt(style.zIndex, 10) > 999)) {
            target.remove();
        }
    }, true);

    // 10. Thay thế setInterval bằng MutationObserver có debounce (Tiết kiệm CPU & Pin học từ uBO)
    let scanTimeout = null;
    const domObserver = new MutationObserver(() => {
        if (!isSiteProtected) return;
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
            scanAndCleanPage();
        }, 300);
    });

    function initObserver() {
        if (document.body) {
            domObserver.observe(document.body, { childList: true, subtree: true });
            scanAndCleanPage();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    domObserver.observe(document.body, { childList: true, subtree: true });
                    scanAndCleanPage();
                }
            });
        }
    }

    initObserver();
})();