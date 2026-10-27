<div align="center">

  <img src="https://raw.githubusercontent.com/TranVPhu/PopupBlockerPro/main/icons/logo.png" alt="Popup Blocker Pro Logo" width="130" style="border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);" />

  # 🛡️ Ultimate Popup & Overlay Blocker Pro (V3.1)

  **Tiện ích chặn toàn diện Popup nhảy tab, Video Ads, Cookie Banners, Lớp phủ vô hình và Vượt qua Anti-Adblock dành cho mọi trình duyệt nhân Chromium (Học hỏi & Tối ưu theo chuẩn uBlock Origin).**

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-89b4fa?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![Chromium Supported](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20C%E1%BB%91cC%E1%BB%91c%20%7C%20Opera-a6e3a1?style=for-the-badge)](https://github.com/TranVPhu/PopupBlockerPro)
  [![Filter Lists](https://img.shields.io/badge/Rules-EasyList%20%2B%20ABPVN%20%2B%20CookieMonster-fab387?style=for-the-badge)](https://github.com/abpvn/abpvn)
  [![License](https://img.shields.io/badge/License-MIT-f38ba8?style=for-the-badge)](LICENSE)

</div>

---

## 🌟 Tính Năng Nổi Bật (Phiên bản 3.1.0)

- 🛡️ **Khắc tinh của Popup & Popunder thông minh**: Áp dụng chuẩn `navigator.userActivation` để chặn đứng 100% popup tự kích hoạt lén lút, link ẩn `target="_blank"`, chống Popup Flood và chiêu trò Popunder làm mờ cửa sổ. Tuyệt đối **không chặn nhầm** cửa sổ Đăng nhập Google/Facebook (OAuth) hoặc lệnh In hóa đơn/Vé điện tử.
- 📥 **Tương thích hoàn hảo với Web App**: Không bao giờ chặn hành vi tải file tự động (hỗ trợ đầy đủ các thẻ ảo `blob:`, `data:`, thuộc tính `download` của Google Docs, Canva, Excel...).
- ⚡ **Bộ công cụ Element Zapper & Element Picker nâng cao (chuẩn uBlock Origin)**:
  - **Element Zapper (⚡ Tẩy nhanh)**: Bấm vào phần tử để xóa ngay lập tức khỏi trang hiện tại mà không cần lưu rule.
  - **Element Picker (🎯 Bộ chọn)**: Rà chuột viền đỏ, hỗ trợ phím mũi tên `[↑]` để mở rộng lên thẻ cha bao bọc và `[↓]` để thu hẹp về thẻ con.
- 🍪 **Xóa sổ hộp thoại Cookie & GDPR Annoyance**: Tự động triệt tiêu các bảng thông báo "Trang này sử dụng Cookie", Cookiebot, OneTrust, Didomi... che khuất nội dung trang web.
- 🚫 **Xóa sổ lớp phủ tàng hình (Invisible Overlays)**: Tự động phát hiện và triệt tiêu các lớp `div` vô hình phủ toàn màn hình chuyên bẫy cú click chuột đầu tiên của bạn.
- ⚡ **Vượt mặt Anti-Adblock (Anti-Adblock Defuser)**: Đánh lừa và vô hiệu hóa các thư viện kiểm tra chặn quảng cáo phổ biến (`FuckAdBlock`, `BlockAdBlock`), tự động mở khóa thanh cuộn trang bị đóng băng.
- 🔋 **Tiết kiệm Pin & Siêu nhẹ (0% CPU Idle)**: Thay thế toàn bộ vòng quét định kỳ `setInterval` bằng `MutationObserver` kết hợp Debounce, chỉ kích hoạt khi trang web thực sự có thay đổi DOM.
- 🌐 **Đồng bộ Declarative Net Request (DNR) chuẩn MV3**: Tự động bật/tắt toàn bộ 15.000+ quy tắc mạng khi chuyển đổi công tắc tiện ích hoặc thêm trang vào Danh sách tin cậy (Whitelist).
- 🚀 **Trình cài đặt 1-Click độc quyền (`CaiDatChanPopup.exe`)**: Tự động nhận diện mọi trình duyệt trên máy tính (Google Chrome, Microsoft Edge, Cốc Cốc, Brave, Opera, Vivaldi), nạp extension trực tiếp và tạo lối tắt Desktop chỉ với 1 cú click.

---

## 🚀 Hướng Dẫn Cài Đặt

### Cách 1: Sử dụng Trình cài đặt tự động (Khuyên dùng - Nhanh nhất)
1. Tải về hoặc mở tệp `dist/CaiDatChanPopup.exe`.
2. Ứng dụng sẽ tự động rà soát các trình duyệt nhân Chromium có sẵn trên máy bạn.
3. Tích chọn trình duyệt bạn muốn sử dụng và bấm **"📌 Mở trang Cài đặt cố định"** (cài vĩnh viễn, dùng được cho mọi trình duyệt) hoặc **"⚡ Chạy kèm Extension & Tạo Shortcut Desktop"** (Edge, Cốc Cốc, Brave, Opera, Vivaldi — Google Chrome bản chính thức đã bỏ cờ `--load-extension`).
4. Làm theo hướng dẫn hiện ra (đường dẫn thư mục đã được copy sẵn vào Clipboard).

### Cách 2: Cài đặt thủ công bằng chế độ Nhà phát triển (Developer Mode)
1. Mở trang quản lý tiện ích trên trình duyệt:
   - Chrome / Cốc Cốc: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn đúng thư mục `PopupBlockerPro` (thư mục chứa file `manifest.json`).

---

## 📂 Cấu Trúc Dự Án

```text
PopupBlockerPro/
├── icons/               # Bộ icon nhận diện thương hiệu chuẩn MV3 (16, 32, 48, 128, 512, .ico)
├── manifest.json        # Tệp cấu hình chuẩn Chrome Extension Manifest V3
├── background.js        # Service Worker: Quản lý badge, chặn tab rác, xử lý context menu
├── bridge.js            # Content Script (ISOLATED): Lọc CSS, xóa lớp phủ & bộ chọn thủ công
├── inject.js            # Script can thiệp (MAIN): Ghi đè window.open & vô hiệu hóa Anti-adblock
├── popup.html           # Giao diện điều khiển Catppuccin Dark Mode
├── popup.js             # Logic bật/tắt toàn hệ thống, danh sách trắng (Whitelist) & thống kê
├── shared.js            # Hằng số dùng chung (whitelist mặc định)
├── rules.json           # Cơ sở dữ liệu quy tắc Declarative Net Request
├── popup_domains.json   # Tên miền popup quảng cáo (quy tắc $popup) để đóng tab kể cả khi có click
├── installer.py         # Mã nguồn Python GUI của công cụ quản lý cài đặt tự động
├── filter_compiler.py   # Module biên dịch bộ lọc dùng chung cho installer & build_easylist
├── build_easylist.py    # Script cập nhật danh sách chặn từ EasyList & ABPVN
└── CaiDatChanPopup.spec # Cấu hình đóng gói PyInstaller
```

---

## 🛠️ Dành Cho Lập Trình Viên

### Cài đặt môi trường phát triển:
```bash
# Tạo môi trường ảo và cài đặt dependencies
python -m venv .venv
.venv\Scripts\activate
pip install pyinstaller pillow
```

### Cập nhật bộ lọc quy tắc mới nhất:
```bash
python build_easylist.py
```

### Đóng gói lại phần mềm cài đặt EXE:
```bash
pyinstaller --onefile --noconsole --name "CaiDatChanPopup" --icon="icons/icon.ico" --clean -y installer.py
```

---

## 📄 Bản Quyền (License)

Dự án được phân phối dưới giấy phép **MIT License**. Mọi đóng góp (Pull Request, Issue) đều được chào đón nồng nhiệt!
