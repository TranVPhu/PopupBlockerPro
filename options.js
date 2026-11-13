const trustedForm = document.getElementById('trustedForm');
const trustedInput = document.getElementById('trustedInput');
const trustedMessage = document.getElementById('trustedMessage');
const trustedList = document.getElementById('trustedList');
const pausedList = document.getElementById('pausedList');
const hiddenList = document.getElementById('hiddenList');

let whitelist = [];
let tempAllow = {};
let customHidden = {};
// Danh sách đang mở: vẽ lại sau mỗi thao tác không được làm nó đóng lại, vì thường phải gỡ nhiều mục liền nhau
const openHosts = new Set();

// Toàn bộ nội dung người dùng và trang web (tên miền, selector) chỉ được gán bằng textContent, không bao giờ qua HTML
function node(tag, { className, text, onClick } = {}, children = []) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    if (onClick) el.addEventListener('click', onClick);
    children.forEach((child) => el.appendChild(child));
    return el;
}

function button(text, onClick, className = '') {
    const el = node('button', { text, onClick, className });
    el.type = 'button';
    return el;
}

function empty(text) {
    return node('li', { className: 'empty', text });
}

function renderTrusted() {
    trustedList.replaceChildren();
    if (whitelist.length === 0) trustedList.appendChild(empty(pbT('trustedEmpty')));
    whitelist.forEach((host) => {
        trustedList.appendChild(node('li', { className: 'row' }, [
            node('span', { className: 'name', text: host }),
            button(pbT('trustedRemove'), () => removeTrusted(host), 'danger')
        ]));
    });
}

function renderPaused() {
    pausedList.replaceChildren();
    const hosts = pbActiveTempAllow(tempAllow);
    if (hosts.length === 0) pausedList.appendChild(empty(pbT('pausedEmpty')));
    hosts.forEach((host) => {
        const minutes = Math.max(1, Math.ceil((tempAllow[host] - Date.now()) / 60000));
        pausedList.appendChild(node('li', { className: 'row' }, [
            node('span', { className: 'name', text: host }),
            node('span', { className: 'meta', text: pbT('pausedLeft', { minutes }) }),
            button(pbT('pausedResume'), () => resumeBlocking(host))
        ]));
    });
}

function renderHidden() {
    hiddenList.replaceChildren();
    const hosts = Object.keys(customHidden).filter((host) => (customHidden[host] || []).length > 0).sort();
    if (hosts.length === 0) hiddenList.appendChild(empty(pbT('hiddenEmpty')));
    hosts.forEach((host) => {
        const selectors = customHidden[host];
        const items = node('ul', {}, selectors.map((selector) => node('li', { className: 'row' }, [
            node('span', { className: 'name selector', text: selector }),
            button(pbT('hiddenRemove'), () => removeHiddenSelector(host, selector), 'danger')
        ])));
        const restoreAll = button(pbT('hiddenRestoreAll'), (e) => {
            e.preventDefault(); // Nút nằm trong summary: không để nó đóng mở danh sách
            restoreHiddenHost(host);
        }, 'danger');
        const details = node('details', {}, [
            node('summary', {}, [
                node('span', { className: 'name', text: host }),
                node('span', { className: 'meta', text: pbT('hiddenCount', { count: selectors.length }) }),
                restoreAll
            ]),
            items
        ]);
        details.open = openHosts.has(host);
        details.addEventListener('toggle', () => {
            if (details.open) openHosts.add(host);
            else openHosts.delete(host);
        });
        hiddenList.appendChild(details);
    });
}

function render() {
    showTrustedMessage(trustedMessageKey);
    renderTrusted();
    renderPaused();
    renderHidden();
}

function readState() {
    return chrome.storage.local.get(['whitelist', 'tempAllow', 'customHidden']).then((res) => {
        whitelist = (res.whitelist || PB_DEFAULT_WHITELIST).slice();
        tempAllow = res.tempAllow || {};
        customHidden = res.customHidden || {};
    });
}

// Lưu khóa chứ không lưu chữ: đổi ngôn ngữ thì thông báo đang hiện cũng đổi theo
let trustedMessageKey = '';

function showTrustedMessage(key) {
    trustedMessageKey = key;
    trustedMessage.textContent = key ? pbT(key) : '';
}

trustedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = pbNormalizeHost(trustedInput.value);
    if (!host) return showTrustedMessage('trustedInvalid');
    if (pbHostInList(host, whitelist)) return showTrustedMessage('trustedExists');
    whitelist.push(host);
    await chrome.storage.local.set({ whitelist });
    trustedInput.value = '';
    showTrustedMessage('');
    render();
});

async function removeTrusted(host) {
    whitelist = whitelist.filter((entry) => entry !== host);
    await chrome.storage.local.set({ whitelist });
    render();
}

// Lệnh đổi cấu hình chỉ background nhận từ trang của extension, trang này là trang của extension
async function resumeBlocking(host) {
    await chrome.runtime.sendMessage({ action: 'set_temp_allow', host, minutes: 0 });
    await readState();
    render();
}

async function removeHiddenSelector(host, selector) {
    const remaining = (customHidden[host] || []).filter((entry) => entry !== selector);
    if (remaining.length > 0) customHidden[host] = remaining;
    else delete customHidden[host];
    await chrome.storage.local.set({ customHidden });
    render();
}

async function restoreHiddenHost(host) {
    delete customHidden[host];
    await chrome.storage.local.set({ customHidden });
    render();
}

// Thay đổi từ popup hay tab khác (kể cả đổi ngôn ngữ) hiện ngay, không cần mở lại trang
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.language) {
        pbSetLanguage(changes.language.newValue);
        pbApplyTranslations();
    }
    if (changes.whitelist || changes.tempAllow || changes.customHidden || changes.language) {
        readState().then(render);
    }
});

// Số phút còn lại của các trang đang tạm bỏ chặn
setInterval(renderPaused, 30000);

pbLoadLanguage().then(readState).then(() => {
    pbApplyTranslations();
    render();
});
