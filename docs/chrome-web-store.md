# Hồ sơ nộp Chrome Web Store

Tài liệu nội bộ để điền vào Developer Dashboard. Phần nội dung cần dán được viết bằng tiếng Anh để người duyệt đọc dễ.

## Việc phải xong trước khi nộp

1. **Cung cấp mã nguồn của bộ lọc.** Chrome Web Store không bắt công khai code, nhưng bộ lọc có gốc GPLv3 (ABPVN) nên người nhận phải lấy được mã nguồn tương ứng của phần đó. Có thể công khai cả repo, hoặc giữ repo chính private và dùng một repo công khai riêng chỉ chứa bộ lọc đã biên dịch, danh sách gốc và công cụ biên dịch.
2. **Đưa chính sách quyền riêng tư lên một địa chỉ công khai.** Dashboard cần một URL ai cũng mở được, và không nhất thiết phải là repo chính. Các link GitHub trong `privacy.html` và `THIRD_PARTY_NOTICES.md` phải trỏ tới nơi người dùng mở được.
3. **Chạy `python package_extension.py`** để lấy bộ lọc mới nhất. Lần nộp đầu có thể giữ `3.1.0`; từ lần sau, mỗi lần phát hành phải tăng `version` trong `manifest.json`.
4. **Ảnh màn hình** đã đúng cỡ 1280×800: tiếng Việt trong `store-assets/vi/`, tiếng Anh trong `store-assets/en/`. Tải đúng bộ cho từng ngôn ngữ trên Dashboard.
5. **Mô tả theo ngôn ngữ:** gói đã có `_locales` cho tiếng Anh (mặc định) và tiếng Việt. Dashboard cho phép viết phần giới thiệu riêng cho từng ngôn ngữ.

## Mô tả một mục đích duy nhất (Single purpose)

> Block unwanted popups, ad tabs, ads, trackers and page overlays so users can browse without interruption.

## Giải thích từng quyền (Permission justification)

| Quyền | Nội dung dán vào Dashboard | Dùng ở đâu |
|---|---|---|
| `declarativeNetRequest` | Blocks ad and tracker requests using the bundled filter rules, and adds allow rules for sites the user trusts or pauses. | `rules.json`, `syncDnrAllowRules` |
| `declarativeNetRequestFeedback` | Reads which rules matched so the extension can show the user how many requests were blocked. The data stays on the device. | `syncDnrCounts` |
| `webNavigation` | Detects new tabs opened by a page and follows their redirects, so that ad tabs can be closed based on their real destination. | `watchNewTab`, `onCommitted` |
| `scripting` | Injects the filter CSS as a user stylesheet so that pages cannot remove or override the hiding rules. | `updateCosmeticCss` |
| `storage` | Saves settings on the device: on/off state, trusted sites, paused sites, hidden elements and the block count. | `background.js`, `popup.js`, `bridge.js` |
| `alarms` | Ends a temporary pause on time and refreshes the block count periodically, because the service worker does not stay running. | `TEMP_ALLOW_ALARM`, `DNR_COUNT_ALARM` |
| `contextMenus` | Adds right-click commands to hide an element, restore hidden elements and create a QR code for a link. | `chrome.contextMenus.create` |
| Host `<all_urls>` | Popups, ads and overlays appear on any website, so blocking must work on every site the user visits. No page data leaves the device. | `content_scripts`, `insertCSS` |

**Remote code:** chọn "No". Toàn bộ code nằm trong gói, tiện ích không tải hay chạy code từ xa. Bộ lọc chỉ cập nhật khi phát hành phiên bản mới.

## Khai báo dữ liệu (Data usage)

Sự thật cần khai, đã đối chiếu với code ngày 31/10/2026: tiện ích không có request mạng nào của riêng nó (lời gọi `fetch` duy nhất đọc file trong gói), và không gửi dữ liệu ra ngoài.

- Tiện ích có **xử lý** địa chỉ trang và nội dung trang ngay trên máy, và **lưu** tên miền người dùng tự thêm.
- Chính sách định nghĩa "user data" rất rộng, gồm cả thông tin về việc người dùng dùng trình duyệt. Vì vậy vẫn cần có chính sách quyền riêng tư, kể cả khi không gửi gì đi.
- Khi điền form, hãy đọc định nghĩa của từng mục trên Dashboard, và tick ba cam kết: không bán dữ liệu, không dùng cho mục đích không liên quan, không dùng để xét tín dụng.

Nếu sau này thêm đồng bộ tài khoản, thanh toán hoặc bất kỳ máy chủ nào cho gói Pro, phải cập nhật form này, `privacy.html`, và báo rõ cho người dùng hiện có.

## Quy định về một mục đích

Chính sách yêu cầu tiện ích có một mục đích hẹp. Được nhiều tính năng nếu chúng cùng phục vụ một lĩnh vực hẹp, không được gộp các chức năng không liên quan, và tiện ích vi phạm có thể bị gỡ. Nguồn: [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq).

| Tính năng | Đánh giá |
|---|---|
| Chặn popup, quảng cáo, trình theo dõi | Mục đích chính |
| Bảng cookie, lớp phủ, hộp thoại chống chặn quảng cáo | Cùng lĩnh vực, ít rủi ro |
| Chọn và ẩn phần tử, tạm bỏ chặn, whitelist | Phục vụ trực tiếp việc chặn |
| **Tạo mã QR** | **Không liên quan đến chặn nội dung, đây là điểm dễ bị từ chối nhất** |

Không có văn bản nào nói riêng về QR, nên đây là đánh giá theo tinh thần chính sách, không phải kết luận của Google.

**Quyết định:** giữ tính năng QR trong sản phẩm và chấp nhận rủi ro này. Khi nộp, hãy ghi tính năng QR trong phần mô tả trên store để người duyệt và người dùng thấy rõ. Nếu store từ chối vì lý do một mục đích, phương án dự phòng là tách QR thành tiện ích riêng chỉ cần quyền `activeTab` và `contextMenus`.

## Các điểm khác cần rà trước khi nộp

- **Tên:** tên `Popup & Overlay Blocker` mô tả đúng chức năng. Tiện ích PopUpOFF có phần mô tả tên gần giống ("Popup and overlay blocker"), nên hãy tìm lại trên store trước khi nộp.
- **Mô tả và ảnh:** không dùng các câu như "chặn 100%". Chính sách cấm nội dung gây hiểu nhầm và không cho phép hứa điều không làm được.
- **Ủng hộ:** ghi rõ là tự nguyện, không mở thêm tính năng. Nếu sau này bán gói Pro, phải nói rõ bạn là người bán, không phải Google, và mô tả rõ phần nào phải trả phí.
- **Affiliate:** hiện không có. Nếu thêm sau này, phải mô tả nổi bật trên trang store và chỉ gắn khi người dùng có thao tác liên quan.
- **Ảnh mã MoMo:** mã nằm trong gói công khai và ai cũng giải nén được, nên hãy kiểm tra mã không để lộ thông tin bạn không muốn công khai.
- **Dữ liệu trong chính sách:** mỗi khi đổi cách xử lý dữ liệu, cập nhật `privacy.html` trước khi phát hành.
