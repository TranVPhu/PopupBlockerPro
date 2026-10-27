"""Biên dịch bộ lọc EasyList / ABPVN / Fanboy thành rules.json (DNR) và popup_domains.json.

Dùng chung cho build_easylist.py (dòng lệnh) và installer.py (giao diện).
"""
import os
import re
import json
import tempfile
import urllib.request

# Nguồn danh sách EasyList quốc tế, ABPVN (Việt Nam) và Fanboy Cookie/Annoyance
FILTER_LIST_URLS = [
    "https://easylist.to/easylist/easylist.txt",
    "https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt",
    "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt"
]

# Các mạng quảng cáo popup/popunder phổ biến luôn được chặn dù nguồn lọc thay đổi
SEED_DOMAINS = [
    "popads.net", "popcash.net", "propellerads.com", "adsterra.com",
    "exoclick.com", "juicyads.com", "clickadu.com", "mgid.com",
    "taboola.com", "outbrain.com", "galaksion.com", "bidgear.com"
]
SEED_POPUP_DOMAINS = [
    "popads.net", "popcash.net", "propellerads.com", "adsterra.com",
    "exoclick.com", "clickadu.com", "galaksion.com"
]

MAX_DOMAINS = 15000
# Ít hơn ngưỡng này coi như tải bộ lọc lỗi -> giữ nguyên rules.json cũ thay vì ghi đè bằng bản rỗng
MIN_DOMAINS = 1000
# Mỗi rule chứa 500 domain để tối ưu tốc độ khớp lệnh của Chromium
CHUNK_SIZE = 500

# Khớp quy tắc chặn tên miền dạng chuẩn EasyList: ||example.com^ hoặc ||example.com^$tuy-chon
DOMAIN_RULE_REGEX = re.compile(r"^\|\|([a-z0-9.-]+\.[a-z]{2,})\^(?:\$(.+))?$")
THIRD_PARTY_OPTIONS = {"third-party", "3p"}
POPUP_OPTIONS = {"popup"} | THIRD_PARTY_OPTIONS

RESOURCE_TYPES = ["script", "sub_frame", "image", "xmlhttprequest", "media"]

# Các quy tắc chuyên biệt cho Video Ads (VAST/VMAP/IMA SDK) & Banner đường dẫn
BASE_RULES = [
    {
        "id": 1,
        "priority": 2,
        "action": {"type": "block"},
        "condition": {
            "urlFilter": "||imasdk.googleapis.com/js/sdkloader/ima3.js",
            "resourceTypes": ["script"]
        }
    },
    {
        "id": 2,
        "priority": 2,
        "action": {"type": "block"},
        "condition": {
            "urlFilter": "*vast*.xml*",
            "resourceTypes": ["xmlhttprequest", "media", "other"]
        }
    },
    {
        "id": 3,
        "priority": 2,
        "action": {"type": "block"},
        "condition": {
            "urlFilter": "*vmap*.xml*",
            "resourceTypes": ["xmlhttprequest", "media", "other"]
        }
    },
    {
        "id": 4,
        "priority": 2,
        "action": {"type": "block"},
        "condition": {
            "urlFilter": "*preroll*",
            "resourceTypes": ["media", "xmlhttprequest", "script"]
        }
    }
]


def parse_filter_lines(lines, any_party, third_party, popup):
    """Phân loại tên miền vào 3 nhóm (dict dùng như set có thứ tự)."""
    for line in lines:
        line = line.strip()
        # Bỏ qua comment, quy tắc ngoại lệ (@@) hoặc quy tắc CSS (##)
        if not line or line.startswith(('!', '[', '@@')) or '##' in line or '#@#' in line or '#?#' in line:
            continue
        match = DOMAIN_RULE_REGEX.match(line)
        if not match:
            continue
        domain, options = match.group(1), match.group(2)
        if not options:
            any_party[domain] = True
            continue
        opts = set(options.split(','))
        if opts <= THIRD_PARTY_OPTIONS:
            third_party[domain] = True
        elif 'popup' in opts and opts <= POPUP_OPTIONS:
            popup[domain] = True


def download_list(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8', errors='ignore').splitlines()


def build_rules(any_party, third_party):
    rules = [dict(r) for r in BASE_RULES]
    rule_id = 10
    for domains, third_party_only in ((any_party, False), (third_party, True)):
        for i in range(0, len(domains), CHUNK_SIZE):
            condition = {
                "requestDomains": domains[i:i + CHUNK_SIZE],
                "resourceTypes": RESOURCE_TYPES
            }
            # Quy tắc $third-party chỉ chặn khi tài nguyên được nhúng từ trang khác, không chặn chính trang đó
            if third_party_only:
                condition["domainType"] = "thirdParty"
            rules.append({
                "id": rule_id,
                "priority": 1,
                "action": {"type": "block"},
                "condition": condition
            })
            rule_id += 1
    return rules


def write_json_atomic(path, data):
    """Ghi ra file tạm rồi thay thế, để file cũ không bị hỏng nếu ghi lỗi giữa chừng."""
    directory = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(',', ':'))
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def compile_filters(ext_dir, progress=None, max_domains=MAX_DOMAINS):
    """Tải toàn bộ nguồn lọc và ghi rules.json + popup_domains.json vào ext_dir.

    progress(index, total, url, error) được gọi sau mỗi nguồn (error = None nếu thành công).
    Ném RuntimeError (và giữ nguyên file cũ) nếu thu được quá ít tên miền.
    """
    any_party = dict.fromkeys(SEED_DOMAINS, True)
    third_party = {}
    popup = dict.fromkeys(SEED_POPUP_DOMAINS, True)

    for idx, url in enumerate(FILTER_LIST_URLS, start=1):
        error = None
        try:
            parse_filter_lines(download_list(url), any_party, third_party, popup)
        except Exception as e:
            error = e
        if progress:
            progress(idx, len(FILTER_LIST_URLS), url, error)

    # Nhóm third-party ít (~2 nghìn) nên giữ trọn, nhóm chặn mọi nơi lấp phần còn lại theo thứ tự nguồn lọc
    third_list = [d for d in third_party if d not in any_party][:max_domains]
    any_list = list(any_party)[:max_domains - len(third_list)]

    total = len(any_list) + len(third_list)
    if total < MIN_DOMAINS:
        raise RuntimeError(
            f"Chỉ thu được {total} tên miền (cần tối thiểu {MIN_DOMAINS}). "
            f"Có thể mất kết nối mạng - đã giữ nguyên rules.json cũ."
        )

    rules = build_rules(sorted(any_list), sorted(third_list))
    write_json_atomic(os.path.join(ext_dir, "rules.json"), rules)
    write_json_atomic(os.path.join(ext_dir, "popup_domains.json"), sorted(popup))

    return {
        "domain_count": total,
        "third_party_count": len(third_list),
        "popup_count": len(popup),
        "rule_count": len(rules)
    }
