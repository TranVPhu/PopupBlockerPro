# Giấy phép của các thành phần trong dự án

Giấy phép MIT trong file `LICENSE` chỉ áp dụng cho mã nguồn do dự án này viết. Các thành phần dưới đây giữ giấy phép riêng.

## Bộ lọc

Ba file `rules.json`, `popup_domains.json` và `cosmetic_rules.js` được biên dịch tự động từ các danh sách sau, nên **không** thuộc giấy phép MIT:

| Danh sách | Nguồn | Giấy phép theo công bố của nguồn | Ghi công |
|---|---|---|---|
| ABPVN List | https://github.com/abpvn/abpvn | GPLv3 | ABPVN |
| EasyList | https://easylist.to/ | GPLv3 trở lên hoặc CC BY-SA 3.0 trở lên, tùy chọn ([chi tiết](https://easylist.to/pages/licence.html)) | The EasyList authors |
| EasyPrivacy | https://easylist.to/ | GPLv3 trở lên hoặc CC BY-SA 3.0 trở lên, tùy chọn ([chi tiết](https://easylist.to/pages/licence.html)) | The EasyList authors |
| Easylist Cookie List (`fanboy-cookiemonster.txt`) | https://secure.fanboy.co.nz/fanboy-cookiemonster.txt | [CC BY 3.0](http://creativecommons.org/licenses/by/3.0/) | Easylist Cookie List |

**Đã thay đổi so với bản gốc:** các quy tắc được chuyển sang định dạng Declarative Net Request và quy tắc ẩn phần tử của tiện ích. Một số quy tắc không có tương đương đã bị bỏ, và có thêm vài quy tắc riêng của dự án (`EXTRA_COSMETIC_LINES` trong `filter_compiler.py`).

**Điều khoản áp dụng:** các file bộ lọc được phân phối theo [GNU GPLv3](LICENSES/GPL-3.0.txt), và phần lấy từ Easylist Cookie List vẫn giữ yêu cầu ghi công của CC BY 3.0.

**Mã nguồn tương ứng:** danh sách gốc lấy từ các địa chỉ ở bảng trên. Công cụ biên dịch là `filter_compiler.py` và `build_easylist.py`, có tại https://github.com/TranVPhu/PopupBlockerPro.

## Thư viện

**qrcode-generator 2.0.4** (`vendor/qrcode.js`): Copyright (c) 2009 Kazuhiko Arase, giấy phép MIT, http://www.d-project.com/. "QR Code" là nhãn hiệu đã đăng ký của DENSO WAVE INCORPORATED.
