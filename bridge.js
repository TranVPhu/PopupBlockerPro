(function () {
    let isSiteProtected = true;
    let lastRightClickedElement = null;
    let pickerActive = false;
    let zapperActive = false;
    let hoveredElement = null;
    let elementStack = [];

    function hostOfOrigin(origin) {
        try {
            return new URL(origin).hostname.replace(/^www\./, '');
        } catch (_) {
            return ''; // Origin 'null' của iframe sandbox
        }
    }

    // Iframe about:blank/blob: không có hostname riêng -> thuộc về trang chứa nó
    const ancestorOrigins = Array.from(window.location.ancestorOrigins || []);
    const currentHost = window.location.hostname.replace(/^www\./, '') || hostOfOrigin(ancestorOrigins[0]);
    const topHost = ancestorOrigins.length > 0 ? hostOfOrigin(ancestorOrigins[ancestorOrigins.length - 1]) : currentHost;

    const GENERIC_COSMETIC_CSS = `
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

    // Hộp thoại đòi tắt chặn quảng cáo (đánh dấu bởi hideAntiAdblockDialogs) & mở khóa cuộn trang
    const DIALOG_CSS = `
    [data-pb-hidden] { display: none !important; }
    html[data-pb-unlock], html[data-pb-unlock] > body { overflow-y: auto !important; }
  `;

    // Áp bộ lọc ABPVN (##) cho tên miền hiện tại và các tên miền cha, trừ các ngoại lệ (#@#).
    // Mỗi selector là một luật CSS riêng: một selector không hợp lệ chỉ làm hỏng chính nó.
    function buildListCosmeticCss() {
        const parts = currentHost.split('.');
        const hosts = parts.map((_, i) => parts.slice(i).join('.'));
        const unhide = new Set(hosts.flatMap(host => PB_COSMETIC.unhide[host] || []));
        // Quy tắc @@...$generichide: trang này phát hiện hoặc bị hỏng bởi các bộ lọc chung
        const skipGeneric = hosts.some(host => PB_COSMETIC.generichide.includes(host));
        const generic = skipGeneric
            ? []
            : PB_COSMETIC.generic.filter(rule => !rule.x.some(host => hosts.includes(host))).map(rule => rule.s);
        const siteRules = hosts.flatMap(host => PB_COSMETIC.sites[host] || []);
        return (skipGeneric ? '' : GENERIC_COSMETIC_CSS) + [...generic, ...siteRules]
            .filter(selector => !unhide.has(selector))
            .map(selector => `${selector} { display: none !important; }`)
            .join('\n');
    }

    const BASE_COSMETIC_CSS = DIALOG_CSS + buildListCosmeticCss();

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

    // 3. Áp dụng cả bộ lọc mặc định và danh sách phần tử người dùng tự ẩn.
    // CSS được chèn qua chrome.scripting (origin USER): trang không nhìn thấy, không gỡ được và không ghi đè được kể cả bằng !important.
    // Thẻ <style> chỉ để ẩn ngay trong lúc chờ background (có thể đang ngủ), và làm dự phòng nếu không chèn được.
    let injectedCss = '';
    let cssQueue = Promise.resolve();

    function applyCosmeticFilter(customRulesMap = {}) {
        const siteSelectors = customRulesMap[currentHost] || [];
        const customCss = siteSelectors.length > 0
            ? `\n${siteSelectors.join(', ')} { display: none !important; visibility: hidden !important; }`
            : '';
        const nextCss = isSiteProtected ? BASE_COSMETIC_CSS + customCss : '';

        let styleEl = document.getElementById('pb-cosmetic-style');
        if (!nextCss) {
            if (styleEl) styleEl.remove();
        } else if (nextCss !== injectedCss && document.documentElement) {
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'pb-cosmetic-style';
                document.documentElement.appendChild(styleEl);
            }
            styleEl.textContent = nextCss;
        }

        // Chạy nối tiếp để lệnh gỡ CSS cũ luôn khớp đúng nội dung đã chèn trước đó
        cssQueue = cssQueue.then(async () => {
            if (nextCss === injectedCss) return;
            const resp = await chrome.runtime.sendMessage({ action: 'update_cosmetic_css', css: nextCss, previous: injectedCss });
            if (!resp || !resp.ok) return;
            injectedCss = nextCss;
            const current = document.getElementById('pb-cosmetic-style');
            if (current && current.textContent === nextCss) current.remove();
        }).catch(() => { }); // Extension vừa được tải lại: thẻ <style> vẫn còn tác dụng
    }

    // 4. Lưu phần tử bị ẩn vào bộ nhớ của tên miền hiện tại
    function saveAndHideElement(targetEl) {
        if (!targetEl || targetEl === document.body || targetEl === document.documentElement) return;
        const selector = generateSelector(targetEl);
        if (!selector) return;

        targetEl.style.setProperty('display', 'none', 'important');
        closeHiddenModals();

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
        banner.textContent = pbT('zapperBanner');
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
                // Ẩn chứ không xóa: xóa node do React quản lý có thể làm sập cả trang
                const zapped = activeEl;
                setTimeout(() => {
                    zapped.style.setProperty('display', 'none', 'important');
                    closeHiddenModals();
                }, 200);
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
        banner.textContent = pbT('pickerBanner');
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
                e.preventDefault(); // Không để trang cuộn đi trong lúc đang chọn
                // Mở rộng vùng chọn lên thẻ cha bao bọc (giống uBlock Origin)
                if (hoveredElement && hoveredElement.parentElement && hoveredElement.parentElement !== document.body) {
                    elementStack.push(hoveredElement);
                    updateHighlight(hoveredElement.parentElement);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
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

    // Hộp thoại được ẩn ngay để không nháy lên màn hình, có thể trước khi đọc xong cấu hình.
    // Khi đó chưa biết trang có được bảo vệ không nên chưa đếm, tránh cộng nhầm ở trang tin cậy hoặc đang tạm bỏ chặn
    let protectionKnown = false;
    let pendingDialogReports = 0;

    function reportDialogHidden() {
        if (!protectionKnown) {
            pendingDialogReports++;
            return;
        }
        chrome.runtime.sendMessage({ action: 'ad_blocked' }).catch(() => { });
    }

    function syncProtectionState() {
        chrome.storage.local.get(['enabled', 'whitelist', 'tempAllow', 'customHidden', 'language'], (res) => {
            pbSetLanguage(res.language);
            const globalEnabled = res.enabled !== undefined ? res.enabled : true;
            const whitelist = res.whitelist || PB_DEFAULT_WHITELIST;
            const allowed = [...whitelist, ...pbActiveTempAllow(res.tempAllow)];
            // Khớp theo trang chính (giống rule mạng allowAllRequests) hoặc theo chính frame (iframe YouTube đã tin cậy)
            const isAllowed = pbHostInList(topHost, allowed) || pbHostInList(currentHost, allowed);

            isSiteProtected = globalEnabled && !isAllowed;
            protectionKnown = true;
            const reports = isSiteProtected ? pendingDialogReports : 0;
            pendingDialogReports = 0;
            for (let i = 0; i < reports; i++) reportDialogHidden();
            if (currentSessionToken) {
                window.dispatchEvent(new CustomEvent('__pb_sync_' + currentSessionToken, {
                    detail: { active: isSiteProtected }
                }));
            }
            applyCosmeticFilter(res.customHidden || {});
            restoreFinishedAds(); // Vừa tạm bỏ chặn giữa lúc đang có quảng cáo: trả lại tốc độ & âm thanh
            if (isSiteProtected) {
                scanAndCleanPage();
            }
        });
    }

    syncProtectionState();
    // Chỉ đồng bộ lại khi cấu hình thay đổi (bỏ qua blockedCount tăng liên tục ở mọi frame của mọi tab)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.language) pbSetLanguage(changes.language.newValue);
        if (changes.enabled || changes.whitelist || changes.tempAllow || changes.customHidden) syncProtectionState();
    });

    // 8. Theo dõi cử chỉ click chuột tin cậy của người dùng (tránh đóng nhầm tab hợp lệ)
    const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [onclick]';

    // Người dùng có chủ đích bấm vào một nút/link không, hay chỉ bấm vào vùng trống (kiểu "click đâu cũng mở tab quảng cáo")?
    function isInteractiveClick(target) {
        if (!(target instanceof Element)) return false;
        const control = target.closest(INTERACTIVE_SELECTOR);
        if (!control && window.getComputedStyle(target).cursor !== 'pointer') return false;

        // Lớp phủ che gần hết trang (<a> trong suốt, <body onclick>) không phải là nút bấm thật.
        // Chỉ xét ở trang chính: trong iframe, banner chiếm trọn frame là bình thường.
        if (window === window.top) {
            const rect = (control || target).getBoundingClientRect();
            if (rect.width * rect.height >= window.innerWidth * window.innerHeight * 0.6) return false;
        }
        return true;
    }

    function reportUserGesture(details) {
        chrome.runtime.sendMessage({ action: 'user_trusted_click', ...details }).catch(() => { });
    }

    document.addEventListener('click', (e) => {
        if (e.isTrusted) reportUserGesture({ interactive: isInteractiveClick(e.target) });
    }, true);

    document.addEventListener('auxclick', (e) => {
        if (e.isTrusted && e.button === 1) reportUserGesture({ interactive: isInteractiveClick(e.target) });
    }, true);

    // "Mở liên kết trong tab mới", "Tìm trên Google"... của menu chuột phải không phát sinh sự kiện click nào
    document.addEventListener('contextmenu', (e) => {
        if (e.isTrusted) reportUserGesture({ interactive: true, contextMenu: true });
    }, true);

    // 9. Dọn dẹp lớp phủ vô hình & Tự động tua Video Ads
    // Chỉ nút của các trình phát đã biết. Không dùng so khớp một phần tên class (VD: "skip-ad"): trang lạ có thể đặt tên đó cho nút khác
    const SKIP_AD_SELECTOR = '.jw-skip, .vjs-skip-button, .videoAdUiSkipButton, .ytp-ad-skip-button, .ytp-skip-ad-button';
    // Nút đã bấm khi đang hiện: mỗi lần trang thay đổi lại quét tiếp, không được bấm lặp lại. Ẩn đi rồi hiện lại (quảng cáo mới) thì bấm lại
    const clickedSkipButtons = new WeakSet();

    // Không tua thẳng tới cuối quảng cáo: trình phát dùng MediaSource (YouTube) chưa tải phần cuối nên video đứng im ở đó,
    // sự kiện ended không bao giờ đến và trình phát kẹt luôn ở màn hình quảng cáo. Phát nhanh & tắt tiếng thì quảng cáo vẫn tự kết thúc
    const AD_PLAYER_SELECTOR = '.jw-flag-ads, .vjs-ad-playing, .ad-showing';
    const AD_VIDEO_SELECTOR = '.jw-flag-ads video, .vjs-ad-playing video, .ad-showing video';
    const AD_PLAYBACK_RATE = 16;
    // Video đang được phát nhanh -> tốc độ & trạng thái tắt tiếng trước đó, để trả lại khi hết quảng cáo
    const spedUpAds = new Map();
    const watchedAdPlayers = new WeakSet();

    function speedUpAdVideos() {
        document.querySelectorAll(AD_VIDEO_SELECTOR).forEach((video) => {
            if (!spedUpAds.has(video)) {
                spedUpAds.set(video, { rate: video.playbackRate, muted: video.muted });
                watchAdPlayer(video.closest(AD_PLAYER_SELECTOR));
            }
            video.muted = true;
            // Nạp quảng cáo tiếp theo (load()) đưa tốc độ về mặc định -> đặt lại
            if (video.playbackRate !== AD_PLAYBACK_RATE) video.playbackRate = AD_PLAYBACK_RATE;
        });
    }

    function restoreFinishedAds() {
        spedUpAds.forEach((saved, video) => {
            if (video.isConnected && video.matches(AD_VIDEO_SELECTOR) && isSiteProtected) return;
            spedUpAds.delete(video);
            // Trình phát có thể đã tự đặt lại tốc độ/âm thanh của người dùng cho video chính: khi đó giữ nguyên
            if (video.playbackRate === AD_PLAYBACK_RATE) video.playbackRate = saved.rate;
            if (video.muted && !saved.muted) video.muted = false;
        });
    }

    // YouTube dùng chung một thẻ <video> cho quảng cáo và video chính: phải trả lại tốc độ ngay khi trình phát bỏ class quảng cáo,
    // không đợi lần quét sau (video chính sẽ bị phát 16x trong lúc đó)
    function watchAdPlayer(player) {
        if (!player || watchedAdPlayers.has(player)) return;
        watchedAdPlayers.add(player);
        new MutationObserver(() => {
            restoreFinishedAds();
            if (protectionKnown && isSiteProtected) speedUpAdVideos();
        }).observe(player, { attributes: true, attributeFilter: ['class'] });
    }

    function scanAndCleanPage() {
        // Chưa đọc xong cấu hình thì chưa biết trang có được bảo vệ không: không tự bấm hay tua video ở trang tin cậy.
        // Đọc xong sẽ quét lại (syncProtectionState)
        if (!protectionKnown || !isSiteProtected || !document.body) return;

        // Bộ lọc vừa áp dụng (kể cả phần tử người dùng tự ẩn) có thể đã ẩn một <dialog> đang mở
        closeHiddenModals();

        // Tự động bấm nút Bỏ qua quảng cáo video nếu có
        document.querySelectorAll(SKIP_AD_SELECTOR).forEach((btn) => {
            if (btn.offsetParent === null) {
                clickedSkipButtons.delete(btn);
            } else if (!clickedSkipButtons.has(btn)) {
                clickedSkipButtons.add(btn);
                btn.click();
            }
        });

        // Cho quảng cáo video chạy nhanh cho xong
        restoreFinishedAds();
        speedUpAdVideos();

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
                    el.setAttribute('data-pb-hidden', '');
                    return;
                }
            }
            el.dataset.pbChecked = 'safe';
        });
    }

    // Nhận diện hộp thoại đòi tắt chặn quảng cáo theo NỘI DUNG, vì mỗi trang đặt tên class khác nhau (VD: ReactModal của tinhte.vn)
    const ANTI_ADBLOCK_TEXT = /(trình|phần mềm|tiện ích|công cụ|ứng dụng)\s+chặn\s+quảng\s+cáo|tắt\s+(bộ\s+)?chặn\s+quảng\s+cáo|cho\s+phép\s+(hiện\s+|hiển\s+thị\s+)?quảng\s+cáo|\bad[\s-]?block/i;
    // Hộp thoại thật chỉ có vài câu. Dài hơn thì có thể là bài viết/khung ứng dụng nhắc tới cụm từ này -> không đụng vào
    const MAX_DIALOG_TEXT = 1000;

    // Tìm phần tử nổi ngoài cùng bao quanh đoạn chữ (lớp nền của hộp thoại). Chữ nằm trong bài viết thường sẽ không có
    function findFloatingAncestor(el) {
        let floating = null;
        for (let cur = el; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
            const style = window.getComputedStyle(cur);
            if (style.position === 'fixed' || (style.position === 'absolute' && parseInt(style.zIndex, 10) >= 1000)) {
                floating = cur;
            }
        }
        return floating;
    }

    // Lớp nền tối tách rời khỏi hộp thoại (kiểu Bootstrap .modal-backdrop) phải được ẩn cùng
    function hideDetachedBackdrops() {
        Array.from(document.body.children).forEach((el) => {
            if (el.children.length > 0 || el.tagName === 'CANVAS' || el.hasAttribute('data-pb-hidden')) return;
            const style = window.getComputedStyle(el);
            const bg = style.backgroundColor.replace(/\s+/g, '');
            if (style.position !== 'fixed' || bg === 'transparent' || bg === 'rgba(0,0,0,0)') return;
            const rect = el.getBoundingClientRect();
            if (rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9) {
                el.setAttribute('data-pb-hidden', '');
            }
        });
    }

    // <dialog> mở bằng showModal() khóa tương tác với toàn bộ phần còn lại của trang. Ẩn nó bằng CSS thì trang vẫn bị khóa,
    // còn người dùng không thấy hộp thoại để đóng: không bấm được gì nữa (VD: sofaflix). Phải đóng hẳn hộp thoại
    function closeHiddenModals() {
        document.querySelectorAll('dialog').forEach((dialog) => {
            try {
                if (dialog.matches(':modal') && !dialog.checkVisibility()) dialog.close();
            } catch (_) { }
        });
    }

    function hideAntiAdblockDialogs(root) {
        if (!isSiteProtected || !root) return;
        const textNodes = [];
        if (root.nodeType === Node.TEXT_NODE) {
            textNodes.push(root);
        } else if (root.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) textNodes.push(walker.currentNode);
        }

        textNodes.forEach((textNode) => {
            const parent = textNode.parentElement;
            if (!parent || !ANTI_ADBLOCK_TEXT.test(textNode.nodeValue.normalize('NFC'))) return;
            if (parent.closest('[data-pb-hidden], script, style, noscript')) return;

            const dialog = findFloatingAncestor(parent);
            if (!dialog || dialog.textContent.length > MAX_DIALOG_TEXT) return;

            // Nút/thanh nhỏ (VD: "Hướng dẫn tắt Adblock" của vnexpress) không khóa cuộn trang. Kích thước 0 là hộp thoại chưa hiện -> vẫn mở khóa
            const rect = dialog.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area === 0 || area >= window.innerWidth * window.innerHeight * 0.25) {
                document.documentElement.setAttribute('data-pb-unlock', '');
            }

            // Ẩn bằng CSS chứ không xóa node: xóa node do React quản lý có thể làm sập cả trang khi React cập nhật lại
            dialog.setAttribute('data-pb-hidden', '');
            closeHiddenModals();
            hideDetachedBackdrops();
            setTimeout(hideDetachedBackdrops, 300);
            reportDialogHidden();
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
            target.setAttribute('data-pb-hidden', '');
        }
    }, true);

    // 10. Thay thế setInterval bằng MutationObserver có debounce (Tiết kiệm CPU & Pin học từ uBO)
    let scanTimeout = null;
    const domObserver = new MutationObserver((mutations) => {
        if (!isSiteProtected) return;
        // Kiểm tra ngay, không debounce: callback chạy trước khi trình duyệt vẽ nên hộp thoại không kịp nháy lên màn hình
        mutations.forEach((m) => {
            if (m.type === 'attributes') {
                // <dialog> có sẵn trong trang vừa được mở (showModal/show): lúc chèn vào nó chưa hiện nên chưa bị nhận diện
                if (m.target.tagName === 'DIALOG' && m.target.open) hideAntiAdblockDialogs(m.target);
            } else {
                m.addedNodes.forEach(hideAntiAdblockDialogs);
            }
        });
        // Hộp thoại đã bị bộ lọc ẩn từ trước, giờ mới được mở
        if (mutations.some((m) => m.type === 'attributes' && m.target.tagName === 'DIALOG')) closeHiddenModals();
        // Gom lại tối đa 300ms chứ không hoãn mãi: trang thay đổi liên tục (đồng hồ đếm của trình phát video) sẽ không bao giờ được quét
        if (!scanTimeout) {
            scanTimeout = setTimeout(() => {
                scanTimeout = null;
                scanAndCleanPage();
            }, 300);
        }
    });

    function startObserving() {
        domObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
        scanAndCleanPage();
        // Hộp thoại đã có sẵn trong HTML trước khi observer bắt đầu theo dõi
        hideAntiAdblockDialogs(document.body);
    }

    function initObserver() {
        if (document.body) {
            startObserving();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) startObserving();
            });
        }
    }

    initObserver();
})();