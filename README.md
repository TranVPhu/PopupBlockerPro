<div align="center">

  <img src="icons/logo.png" alt="Logo Popup & Overlay Blocker" width="130" />

  # 🛡️ Popup & Overlay Blocker

  **Tiện ích chặn popup, tab quảng cáo, trình theo dõi, bảng cookie và lớp phủ gây phiền cho các trình duyệt nhân Chromium, có tối ưu cho trang Việt Nam.**

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-89b4fa?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![Filter Lists](https://img.shields.io/badge/Rules-EasyList%20%2B%20EasyPrivacy%20%2B%20ABPVN-fab387?style=for-the-badge)](THIRD_PARTY_NOTICES.md)
  [![License](https://img.shields.io/badge/Code-MIT-f38ba8?style=for-the-badge)](LICENSE)
  [![Filters License](https://img.shields.io/badge/Filters-GPLv3-a6e3a1?style=for-the-badge)](THIRD_PARTY_NOTICES.md)

</div>

---

## 🌟 Tính Năng (Phiên bản 3.1.0)

- 🛡️ **Chặn popup và popunder**: Chặn popup tự mở khi không có thao tác của người dùng, popup mở hàng loạt, và đóng tab mới nếu nó đi tới tên miền quảng cáo đã biết hoặc sang trang khác sau một cú click vào vùng không bấm được. Các trang đăng nhập phổ biến (Google, Facebook, Microsoft...) được miễn để hạn chế đóng nhầm.
- 🌐 **Chặn quảng cáo và trình theo dõi ở tầng mạng**: Dùng Declarative Net Request với quy tắc biên dịch từ EasyList, EasyPrivacy, ABPVN và Easylist Cookie List.
- 🧹 **Ẩn phần tử quảng cáo**: Áp dụng quy tắc `##` của ABPVN để ẩn các ô quảng cáo trống. Ngoại lệ `@@` của các danh sách cũng được áp dụng để giảm rủi ro hỏng trang.
- 🍪 **Ẩn bảng thông báo cookie**: Nhận diện các loại phổ biến như OneTrust, Cookiebot, Didomi.
- 🚫 **Xử lý lớp phủ vô hình**: Phát hiện và ẩn các lớp phủ toàn màn hình trong suốt chuyên bẫy cú click.
- 🔓 **Giảm hộp thoại đòi tắt chặn quảng cáo**: Giả lập các thư viện kiểm tra phổ biến (`FuckAdBlock`, `BlockAdBlock`), ẩn hộp thoại nhận diện được qua nội dung tiếng Việt và tiếng Anh, rồi mở lại thanh cuộn.
- 🎯 **Tự chọn phần tử cần ẩn**:
  - **Tẩy nhanh (Zapper)**: Bấm vào phần tử để ẩn trong lần xem hiện tại, không lưu lại.
  - **Rà chọn (Picker)**: Rà chuột để chọn và lưu quy tắc ẩn, dùng phím `[↑]` và `[↓]` để mở rộng hoặc thu hẹp vùng chọn.
- ⏸️ **Tạm bỏ chặn theo trang**: Tắt chặn cho trang đang xem bằng 1 nút trong popup, sau 30 phút tự chặn lại.
- 📱 **Tạo mã QR cho đường link**: Từ popup hoặc menu chuột phải. Có thể sửa link, tải ảnh PNG hoặc sao chép ảnh. Mã được tạo ngay trên máy.
- 🌐 **Giao diện tiếng Việt và tiếng Anh**: Chọn ngay trong popup. Lần đầu tự theo ngôn ngữ của trình duyệt.
- 🔋 **Tiết kiệm tài nguyên khi trang không đổi**: Dùng `MutationObserver` có debounce thay cho vòng quét định kỳ trong trang.
- 📥 **Không can thiệp tải file**: Các link `blob:`, `data:` và thuộc tính `download` được bỏ qua khi kiểm tra click tự động.

## ⚠️ Giới Hạn Cần Biết

Không có tiện ích chặn quảng cáo nào bắt được mọi thứ, và tiện ích này cũng vậy:

- **Mặc định không chặn trên** `google.com`, `youtube.com`, `facebook.com`, `github.com` vì nằm trong danh sách tin cậy. Bạn có thể gỡ trong popup, nhưng tiện ích không có cơ chế riêng cho quảng cáo video YouTube.
- **Có thể lọt**: Link thật bị thay để mở thêm tab quảng cáo, và tab từ nút thật tới tên miền chưa có trong danh sách. Một số dạng quy tắc của bộ lọc cũng chưa được biên dịch.
- **Có thể chặn nhầm**: Nếu trang có phần tử bấm được nhưng không có dấu hiệu nào (không phải nút, không có con trỏ bàn tay) và nó mở tab sang trang khác, tab đó sẽ bị đóng. Khi gặp, hãy dùng nút tạm bỏ chặn hoặc thêm trang vào danh sách tin cậy.
- **Số trên icon** do Chrome đếm, gồm cả trình theo dõi, và có thể lệch nhẹ so với thực tế.
- **Bộ lọc** chỉ cập nhật khi cài phiên bản mới của tiện ích.

---

## 🚀 Hướng Dẫn Cài Đặt

### Cách 1: Cài thủ công bằng chế độ Nhà phát triển
1. Mở trang quản lý tiện ích trên trình duyệt:
   - Chrome / Cốc Cốc: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn đúng thư mục `PopupBlockerPro` (thư mục chứa file `manifest.json`).

### Cách 2: Dùng trình cài đặt trên Windows
Trình cài đặt `CaiDatChanPopup.exe` không có sẵn trong repo, cần tự đóng gói theo hướng dẫn ở phần dành cho lập trình viên. File chưa được ký số nên Windows có thể cảnh báo.

1. Mở `dist/CaiDatChanPopup.exe` sau khi đóng gói.
2. Ứng dụng rà soát các trình duyệt nhân Chromium có trên máy.
3. Chọn trình duyệt rồi bấm **"📌 Mở trang Cài đặt cố định"** (dùng được cho mọi trình duyệt) hoặc **"⚡ Chạy kèm Extension & Tạo Shortcut Desktop"** (Edge, Cốc Cốc, Brave, Opera, Vivaldi; Google Chrome bản chính thức đã bỏ cờ `--load-extension`).
4. Làm theo hướng dẫn hiện ra (đường dẫn thư mục đã được copy sẵn vào Clipboard).

---

## 📂 Cấu Trúc Dự Án

```text
PopupBlockerPro/
├── icons/               # Bộ icon (16, 32, 48, 128, 512, .ico)
├── manifest.json        # Cấu hình Chrome Extension Manifest V3
├── background.js        # Service Worker: badge, đóng tab quảng cáo, menu chuột phải
├── bridge.js            # Content Script (ISOLATED): lọc CSS, ẩn lớp phủ, bộ chọn phần tử
├── inject.js            # Script trong trang (MAIN): kiểm soát window.open, giả lập thư viện kiểm tra
├── popup.html, popup.js # Giao diện điều khiển, danh sách tin cậy và thống kê
├── qr.html, qr.js       # Trang tạo mã QR
├── donate.html          # Trang ủng hộ, cần thêm ảnh momo-qr.png thì link mới hiện
├── privacy.html         # Chính sách quyền riêng tư và giấy phép
├── vendor/qrcode.js     # Thư viện qrcode-generator 2.0.4 của Kazuhiko Arase (MIT)
├── shared.js            # Hằng số dùng chung
├── i18n.js, i18n-page.js # Từ điển hai ngôn ngữ và phần áp dụng cho trang tĩnh
├── _locales/            # Mô tả tiện ích theo ngôn ngữ, dùng cho manifest và store
├── rules.json           # Quy tắc Declarative Net Request (biên dịch tự động)
├── cosmetic_rules.js    # Quy tắc ẩn phần tử (biên dịch tự động)
├── popup_domains.json   # Tên miền popup quảng cáo (biên dịch tự động)
├── filter_compiler.py   # Module biên dịch bộ lọc
├── build_easylist.py    # Script cập nhật bộ lọc
├── package_extension.py # Đóng gói ZIP để nộp store
├── installer.py         # Mã nguồn công cụ cài đặt trên Windows
├── docs/                # Hồ sơ nộp Chrome Web Store
└── tests/               # Kiểm thử Python và end-to-end
```

---

## 🛠️ Dành Cho Lập Trình Viên

### Cài đặt môi trường phát triển:
```bash
python -m venv .venv
.venv\Scripts\activate
pip install pyinstaller pillow
```

### Cập nhật bộ lọc quy tắc mới nhất:
```bash
python build_easylist.py
```
GitHub Action `update-filters` tự chạy việc này mỗi tuần: nếu toàn bộ test đạt, bộ lọc mới được commit thẳng vào `main`. Chế độ `--strict` từ chối ghi đè khi có nguồn lọc lỗi hoặc số tên miền tụt hơn 30%.

### Chạy kiểm thử:
```bash
python -m unittest discover -s tests -p "test_*.py"
cd tests
npm ci
npx playwright install chromium
npm test            # toàn bộ, hoặc: node run-all.js popups
```

### Đóng gói:
```bash
python package_extension.py   # ZIP nộp store
pyinstaller --onefile --noconsole --name "CaiDatChanPopup" --icon="icons/icon.ico" --clean -y installer.py
```

### Bật link ủng hộ:
Đặt ảnh mã MoMo vào thư mục gốc với tên `momo-qr.png`. Link trong popup sẽ tự hiện, và tiện ích không hiện thông báo nhắc nào. Ảnh này nằm trong gói công khai, nên cần kiểm tra mã không để lộ thông tin bạn không muốn công khai.

---

## 🔒 Quyền Riêng Tư

Tiện ích không có máy chủ và không gửi dữ liệu duyệt web đi đâu. Xem chi tiết trong [privacy.html](privacy.html).

## 📄 Bản Quyền

- **Mã nguồn của dự án:** [MIT License](LICENSE).
- **Các file bộ lọc** (`rules.json`, `popup_domains.json`, `cosmetic_rules.js`): biên dịch từ danh sách của bên thứ ba, phân phối theo [GPLv3](LICENSES/GPL-3.0.txt).
- **Ghi công và chi tiết:** xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
