(function () {
    let isSiteProtected = true;
    let lastRightClickedElement = null;
    let pickerActive = false;
    let hoveredElement = null;

    const currentHost = window.location.hostname.replace(/^www\./, '');
    const DEFAULT_WHITELIST = ['google.com', 'youtube.com', 'facebook.com', 'github.com'];

    const COSMETIC_CSS = `
    .ads-banner, .ad-banner, .banner-ads, .banner-quangcao,
    .ad-container, .ads-container, .ad-wrapper, .ads-wrapper,
    .ad-slot, .ad-box, .ads-box, .qc-banner, .box-quang-cao,
    div[id^="div-gpt-ad"], ins.adsbygoogle, iframe[src*="ads"],
    a[href*="adsterra"], a[href*="propellerads"], a[href*="mgid.com"],
    .floating-ads, .sticky-ads, .bottom-ads, .catfish-ads, #catfish-ad {
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
    function generateSelector(el) {
        if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return null;
        if (el.id && !/^\d/.test(el.id)) {
            return `#${CSS.escape(el.id)}`;
        }
        const path = [];
        let current = el;
        while (current && current.nodeType === 1 && current !== document.body && path.length < 4) {
            let selector = current.nodeName.toLowerCase();
            if (current.id && !/^\d/.test(current.id)) {
                selector = `#${CSS.escape(current.id)}`;
                path.unshift(selector);
                break;
            } else {
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
                path.unshift(selector);
                current = current.parentElement;
            }
        }
        return path.join(' > ');
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

    // 5. Chế độ Element Picker (Rà chuột tô đỏ khung quảng cáo giống uBlock Origin)
    function startElementPicker() {
        if (pickerActive) return;
        pickerActive = true;

        const banner = document.createElement('div');
        banner.id = 'pb-picker-banner';
        banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#a6e3a1;padding:10px 18px;border-radius:8px;z-index:2147483647;font:bold 13px sans-serif;box-shadow:0 4px 15px rgba(0,0,0,0.5);border:2px solid #89b4fa;pointer-events:none;';
        banner.textContent = '🎯 Chế độ chọn quảng cáo: Click chuột trái để ẩn phần tử | Nhấn phím ESC để thoát';
        document.body.appendChild(banner);

        function onMouseOver(e) {
            if (e.target === banner) return;
            if (hoveredElement) hoveredElement.style.outline = '';
            hoveredElement = e.target;
            hoveredElement.style.outline = '3px solid #f38ba8';
        }

        function onClick(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (hoveredElement && hoveredElement !== banner) {
                hoveredElement.style.outline = '';
                saveAndHideElement(hoveredElement);
            }
            stopPicker();
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') stopPicker();
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

    // 6. Lắng nghe lệnh từ Menu Chuột Phải hoặc Popup
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'block_right_clicked_el' && lastRightClickedElement) {
            saveAndHideElement(lastRightClickedElement);
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

    function syncProtectionState() {
        chrome.storage.local.get(['enabled', 'whitelist', 'customHidden'], (res) => {
            const globalEnabled = res.enabled !== undefined ? res.enabled : true;
            const whitelist = res.whitelist || DEFAULT_WHITELIST;
            const isWhitelisted = whitelist.some(
                domain => currentHost === domain || currentHost.endsWith('.' + domain)
            );

            isSiteProtected = globalEnabled && !isWhitelisted;
            if (document.documentElement) {
                document.documentElement.dataset.pbActive = isSiteProtected ? 'true' : 'false';
            }
            applyCosmeticFilter(res.customHidden || {});
        });
    }

    syncProtectionState();
    chrome.storage.onChanged.addListener(syncProtectionState);

    // 7. Quét xóa lớp phủ vô hình đè lên video & Tự động tua Video Ads
    function scanAndCleanPage() {
        if (!isSiteProtected || !document.body) return;

        const skipButtons = document.querySelectorAll(
            '.jw-skip, .vjs-skip-button, .videoAdUiSkipButton, .ytp-ad-skip-button, .ytp-skip-ad-button, [class*="skip-ad"]'
        );
        skipButtons.forEach(btn => { if (btn.offsetParent !== null) btn.click(); });

        const adPlayers = document.querySelectorAll('.jw-flag-ads video, .vjs-ad-playing video, .ad-showing video');
        adPlayers.forEach(video => {
            if (video.duration && isFinite(video.duration) && video.currentTime < video.duration) {
                video.muted = true;
                video.currentTime = video.duration;
            }
        });

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const mediaRects = Array.from(document.querySelectorAll('video, iframe')).map(el => el.getBoundingClientRect());

        const candidates = document.querySelectorAll('div, a, section, ins, span');
        candidates.forEach(el => {
            if (el.dataset.pbChecked === 'safe' || el.id === 'pb-picker-banner') return;

            const style = window.getComputedStyle(el);
            if (style.position !== 'fixed' && style.position !== 'absolute') return;

            const zIndex = parseInt(style.zIndex, 10);
            const rect = el.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 50) return;

            const coversViewport = (rect.width >= vw * 0.65 && rect.height >= vh * 0.65);
            const coversVideo = mediaRects.some(mRect => {
                if (mRect.width < 100 || mRect.height < 100) return false;
                const overlapX = Math.max(0, Math.min(rect.right, mRect.right) - Math.max(rect.left, mRect.left));
                const overlapY = Math.max(0, Math.min(rect.bottom, mRect.bottom) - Math.max(rect.top, mRect.top));
                return (overlapX * overlapY) >= (mRect.width * mRect.height * 0.5);
            });

            if (!coversViewport && !coversVideo) return;

            const opacity = parseFloat(style.opacity);
            const bg = style.backgroundColor.replace(/\s+/g, '');
            const isTransparentBg = (bg === 'transparent' || bg === 'rgba(0,0,0,0)');
            const hasNoContent = el.innerText.trim().length === 0 && !el.querySelector('video, img, canvas, input, button');

            if ((opacity < 0.12) || (isTransparentBg && hasNoContent && (zIndex > 99 || coversVideo))) {
                el.remove();
            } else {
                el.dataset.pbChecked = 'safe';
            }
        });
    }

    window.addEventListener('mousedown', scanAndCleanPage, true);
    setInterval(scanAndCleanPage, 1200);
})();