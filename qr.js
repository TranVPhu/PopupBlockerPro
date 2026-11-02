const canvas = document.getElementById('qrCanvas');
const messageBox = document.getElementById('message');
const linkInput = document.getElementById('linkInput');
const backBtn = document.getElementById('backBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');

const QUIET_ZONE = 4; // Chuẩn QR yêu cầu viền trắng rộng 4 ô
const TARGET_SIZE = 512; // Kích thước ảnh PNG tối thiểu (px), đủ nét khi in

// Mặc định thư viện chỉ giữ 1 byte mỗi ký tự, làm hỏng link có tiếng Việt
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

function showMessage(text) {
    messageBox.textContent = text;
    messageBox.hidden = false;
    canvas.hidden = true;
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
}

function drawQr(text) {
    const qr = qrcode(0, 'M'); // 0 = tự chọn phiên bản theo độ dài, M = chịu lỗi ~15%
    qr.addData(text, 'Byte');
    qr.make();

    const modules = qr.getModuleCount();
    const scale = Math.ceil(TARGET_SIZE / (modules + QUIET_ZONE * 2));
    canvas.width = canvas.height = (modules + QUIET_ZONE * 2) * scale;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
            if (qr.isDark(row, col)) {
                ctx.fillRect((col + QUIET_ZONE) * scale, (row + QUIET_ZONE) * scale, scale, scale);
            }
        }
    }
}

function render() {
    const text = linkInput.value.trim();
    if (!text) {
        showMessage(pbT('qrEmpty'));
        return;
    }
    try {
        drawQr(text);
    } catch (err) {
        // Thư viện báo lỗi khi vượt sức chứa của QR (khoảng 2.300 byte ở mức M)
        showMessage(pbT('qrTooLong'));
        return;
    }
    messageBox.hidden = true;
    canvas.hidden = false;
    downloadBtn.disabled = false;
    copyBtn.disabled = false;
}

let copyLabelTimer = null;

function flashCopyLabel(label) {
    copyBtn.textContent = label;
    clearTimeout(copyLabelTimer);
    copyLabelTimer = setTimeout(() => { copyBtn.textContent = pbT('qrCopy'); }, 1500);
}

function buildFileName(text) {
    let host = 'link';
    try {
        host = new URL(text).hostname.replace(/^www\./, '') || host;
    } catch (_) { }
    return `qr-${host.replace(/[^a-z0-9.-]/gi, '_')}.png`;
}

function canvasToPngBlob() {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

downloadBtn.addEventListener('click', async () => {
    const blob = await canvasToPngBlob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = buildFileName(linkInput.value.trim());
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToPngBlob() })]);
        flashCopyLabel(pbT('qrCopied'));
    } catch (err) {
        flashCopyLabel(pbT('qrCopyFailed'));
    }
});

linkInput.addEventListener('input', render);

backBtn.addEventListener('click', () => history.back());

// ?url=... : đường link cần tạo mã. ?from=popup : đang mở bên trong popup nên có nút quay lại
const params = new URLSearchParams(window.location.search);
linkInput.value = params.get('url') || '';
backBtn.hidden = params.get('from') !== 'popup';
render();

// Mã QR không phụ thuộc ngôn ngữ nên vẽ ngay, phần chữ dịch sau khi đọc xong lựa chọn
pbLoadLanguage().then(() => {
    pbApplyTranslations();
    render();
});
