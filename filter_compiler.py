"""Biên dịch bộ lọc EasyList / ABPVN / Fanboy thành rules.json (DNR), popup_domains.json và cosmetic_rules.js.

Dùng chung cho build_easylist.py (dòng lệnh) và installer.py (giao diện).
"""
import os
import re
import json
import tempfile
import urllib.request

# Nguồn danh sách EasyList quốc tế, EasyPrivacy (trình theo dõi), ABPVN (Việt Nam) và Fanboy Cookie/Annoyance
FILTER_LIST_URLS = [
    "https://easylist.to/easylist/easylist.txt",
    "https://easylist.to/easylist/easyprivacy.txt",
    "https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt",
    "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt"
]
# Chỉ lấy quy tắc ẩn phần tử (##) từ ABPVN: danh sách nhỏ và sát với các trang Việt Nam
COSMETIC_SOURCE_URL = "https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt"

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

# Các nguồn lọc hiện có khoảng 60 nghìn tên miền. Giới hạn thấp hơn sẽ cắt mất các mạng lớn (pubmatic, rubiconproject...)
MAX_DOMAINS = 100000
# Ít hơn ngưỡng này coi như tải bộ lọc lỗi -> giữ nguyên rules.json cũ thay vì ghi đè bằng bản rỗng
MIN_DOMAINS = 1000
# Chế độ strict (cập nhật tự động, không có ai xem): số tên miền tụt quá mức này coi như nguồn lọc có vấn đề
MAX_SHRINK_RATIO = 0.3
# Mỗi rule chứa 500 domain để tối ưu tốc độ khớp lệnh của Chromium
CHUNK_SIZE = 500

# Khớp quy tắc chặn tên miền dạng chuẩn EasyList: ||example.com^ hoặc ||example.com^$tuy-chon
DOMAIN_RULE_REGEX = re.compile(r"^\|\|([a-z0-9.-]+\.[a-z]{2,})\^(?:\$(.+))?$")
THIRD_PARTY_OPTIONS = {"third-party", "3p"}
POPUP_OPTIONS = {"popup"} | THIRD_PARTY_OPTIONS

RESOURCE_TYPES = ["script", "sub_frame", "image", "xmlhttprequest", "media", "ping"]

# Quy tắc ngoại lệ (@@) phải có priority cao hơn quy tắc chặn (1-2) nhưng thấp hơn whitelist của người dùng (100).
# Dải id riêng giúp background.js phân biệt lượt "cho phép" với lượt "chặn" khi đếm.
EXCEPTION_PRIORITY = 3
EXCEPTION_RULE_ID_START = 100000
EXCEPTION_TYPE_MAP = {
    "script": "script", "image": "image", "stylesheet": "stylesheet",
    "xmlhttprequest": "xmlhttprequest", "subdocument": "sub_frame", "media": "media",
    "font": "font", "object": "object", "ping": "ping", "websocket": "websocket", "other": "other"
}
DOMAIN_NAME_REGEX = re.compile(r"^[a-z0-9.-]+$")
HOST_ONLY_PATTERN_REGEX = re.compile(r"^\|\|([a-z0-9.-]+)\^?$")

# Bổ sung cho ABPVN: quy tắc của họ khớp chính xác thuộc tính style nên bỏ sót các ô có thêm "display:block;margin:0 auto"
EXTRA_COSMETIC_LINES = [
    'tinhte.vn##.col-right .hidden-md > div[style*="height:250px"]',
    'tinhte.vn##.col-right .hidden-md > div:has(> div[style*="height:250px"])',
    'tinhte.vn##.col-right .hidden-md > .main:has(> .item[style*="height:"])',
    'tinhte.vn##.ads-middle'
]

COSMETIC_RULE_REGEX = re.compile(r"^([^#]*)#(@)?#(.+)$")
# Cú pháp riêng của adblocker mà CSS không hiểu. Dấu ngoặc nhọn có thể chèn CSS tùy ý nên cũng loại bỏ.
UNSUPPORTED_SELECTOR_REGEX = re.compile(
    r"[{}]|:-abp-|:has-text|:contains|:xpath|:remove|:style|:upward|:matches-|:nth-ancestor|:min-text-length|:others|:watch-attr|:if\(|:if-not|^\+js"
)

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


def parse_rule_options(pattern, options):
    """Chuyển pattern và tùy chọn sau dấu $ thành điều kiện DNR. Trả về (condition, types, excluded, flags) hoặc None."""
    condition = {"urlFilter": pattern}
    types, excluded = [], []
    flags = set()
    for opt in filter(None, options.split(',')):
        negated = opt.startswith('~')
        name = opt[1:] if negated else opt
        if opt.startswith('domain='):
            domains = opt[len('domain='):].split('|')
            if not all(DOMAIN_NAME_REGEX.match(d.lstrip('~')) for d in domains):
                return None
            included = [d for d in domains if not d.startswith('~')]
            not_included = [d[1:] for d in domains if d.startswith('~')]
            if included:
                condition["initiatorDomains"] = included
            if not_included:
                condition["excludedInitiatorDomains"] = not_included
        elif opt in ("third-party", "3p"):
            condition["domainType"] = "thirdParty"
        elif opt in ("~third-party", "first-party", "1p"):
            condition["domainType"] = "firstParty"
        elif opt == "match-case":
            condition["isUrlFilterCaseSensitive"] = True
        elif name in EXCEPTION_TYPE_MAP:
            (excluded if negated else types).append(EXCEPTION_TYPE_MAP[name])
        elif opt in ("popup", "document", "generichide"):
            flags.add(opt)
        else:
            return None  # csp, removeparam, redirect... không có tương đương trong DNR
    return condition, types, excluded, flags


def host_of_pattern(pattern):
    """Phần tên miền của pattern ||host/path, hoặc None nếu có ký tự đại diện."""
    match = re.match(r"^\|\|([a-z0-9.-]+)(?:[/^?:]|$)", pattern)
    return match.group(1) if match else None


def is_covered_by(host, domains):
    parts = host.split('.')
    return any('.'.join(parts[i:]) in domains for i in range(len(parts)))


def parse_block_rule_lines(lines, block_rules):
    """Quy tắc ||host có đường dẫn hoặc tùy chọn. Dạng khớp chuỗi con (-ad-sidebar.) cố ý bỏ qua vì dễ chặn nhầm."""
    for line in lines:
        line = line.strip()
        if not line.startswith('||') or line.startswith('||*') or not line.isascii() or '##' in line or '#@#' in line:
            continue
        if DOMAIN_RULE_REGEX.match(line) and (not line.partition('$')[2] or POPUP_OPTIONS.issuperset(line.partition('$')[2].split(','))):
            continue  # Đã xử lý trong parse_filter_lines
        pattern, _, options = line.partition('$')
        parsed = parse_rule_options(pattern, options)
        if not parsed:
            continue
        condition, types, excluded, flags = parsed
        if flags:
            continue  # $document, $popup là chặn điều hướng, không phải tài nguyên trong trang
        if types:
            condition["resourceTypes"] = types
        elif excluded:
            condition["excludedResourceTypes"] = excluded
        rule = {"action": {"type": "block"}, "condition": condition}
        block_rules[json.dumps(rule, sort_keys=True)] = rule


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


def parse_exception_line(line):
    """Chuyển 1 dòng @@ thành (loại, dữ liệu). Trả về None nếu DNR không biểu diễn được."""
    pattern, _, options = line[2:].partition('$')
    if not pattern or pattern.startswith('||*') or not pattern.isascii():
        return None
    if pattern.startswith('/') and pattern.endswith('/') and len(pattern) > 1:
        return None  # Regex của adblocker khác cú pháp RE2 của DNR

    parsed = parse_rule_options(pattern, options)
    if not parsed:
        return None
    condition, types, excluded, flags = parsed

    host_match = HOST_ONLY_PATTERN_REGEX.match(pattern)
    if "generichide" in flags:
        return ("generichide", host_match.group(1)) if host_match else None
    if "popup" in flags and not types:
        return ("popup", host_match.group(1)) if host_match and "initiatorDomains" not in condition else None
    if "document" in flags:
        if "initiatorDomains" in condition:
            return None
        condition["resourceTypes"] = ["main_frame", "sub_frame"]
        return ("rule", {"action": {"type": "allowAllRequests"}, "condition": condition})

    if types:
        condition["resourceTypes"] = types
    elif excluded:
        condition["excludedResourceTypes"] = excluded
    return ("rule", {"action": {"type": "allow"}, "condition": condition})


def parse_exception_lines(lines, exceptions, popup_exceptions, generichide):
    for line in lines:
        line = line.strip()
        if not line.startswith('@@'):
            continue
        parsed = parse_exception_line(line)
        if not parsed:
            continue
        kind, value = parsed
        if kind == "rule":
            # Dict dùng như set có thứ tự, loại các dòng trùng giữa nhiều nguồn lọc
            exceptions[json.dumps(value, sort_keys=True)] = value
        elif kind == "popup":
            popup_exceptions.add(value)
        else:
            generichide.add(value)


def parse_cosmetic_lines(lines):
    """Trích quy tắc ẩn phần tử: generic (mọi trang), sites (theo tên miền), unhide (ngoại lệ #@#)."""
    generic = {}
    sites = {}
    unhide = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith('!'):
            continue
        match = COSMETIC_RULE_REGEX.match(line)
        if not match:
            continue
        domains_text, is_unhide, selector = match.groups()
        if UNSUPPORTED_SELECTOR_REGEX.search(selector):
            continue
        domains = domains_text.split(',') if domains_text else []
        if not all(DOMAIN_NAME_REGEX.match(d.lstrip('~')) for d in domains):
            continue  # Tên miền đại diện (google.*) hoặc thực ra là URL chứa dấu #
        included = [d for d in domains if not d.startswith('~')]
        excluded = [d[1:] for d in domains if d.startswith('~')]
        if is_unhide:
            for d in included:
                unhide.setdefault(d, []).append(selector)
        elif included:
            for d in included:
                sites.setdefault(d, []).append(selector)
        else:
            generic[selector] = excluded
    return {
        "generic": [{"s": s, "x": x} for s, x in generic.items()],
        "sites": sites,
        "unhide": unhide
    }


def download_list(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8', errors='ignore').splitlines()


def build_rules(any_party, third_party, exceptions=(), block_rules=()):
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
    for block_rule in block_rules:
        rules.append({"id": rule_id, "priority": 1, **block_rule})
        rule_id += 1
    for offset, exception in enumerate(exceptions):
        rules.append({"id": EXCEPTION_RULE_ID_START + offset, "priority": EXCEPTION_PRIORITY, **exception})
    return rules


def write_text_atomic(path, text):
    """Ghi ra file tạm rồi thay thế, để file cũ không bị hỏng nếu ghi lỗi giữa chừng."""
    directory = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def to_compact_json(data):
    return json.dumps(data, separators=(',', ':'), ensure_ascii=False)


def write_json_atomic(path, data):
    write_text_atomic(path, to_compact_json(data))


def count_existing_domains(ext_dir):
    try:
        with open(os.path.join(ext_dir, "rules.json"), encoding="utf-8") as f:
            return sum(len(r["condition"].get("requestDomains", [])) for r in json.load(f))
    except (OSError, ValueError, KeyError, TypeError):
        return 0


def compile_filters(ext_dir, progress=None, max_domains=MAX_DOMAINS, strict=False):
    """Tải toàn bộ nguồn lọc và ghi rules.json, popup_domains.json, cosmetic_rules.js vào ext_dir.

    progress(index, total, url, error) được gọi sau mỗi nguồn (error = None nếu thành công).
    Ném RuntimeError (và giữ nguyên file cũ) nếu thu được quá ít tên miền.
    strict=True: còn từ chối khi có bất kỳ nguồn nào lỗi hoặc số tên miền tụt mạnh so với bản hiện tại.
    """
    any_party = dict.fromkeys(SEED_DOMAINS, True)
    third_party = {}
    popup = dict.fromkeys(SEED_POPUP_DOMAINS, True)
    exceptions = {}
    block_rules = {}
    popup_exceptions = set()
    generichide = set()
    cosmetic = None
    failed_urls = []

    for idx, url in enumerate(FILTER_LIST_URLS, start=1):
        error = None
        try:
            lines = download_list(url)
            parse_filter_lines(lines, any_party, third_party, popup)
            parse_exception_lines(lines, exceptions, popup_exceptions, generichide)
            parse_block_rule_lines(lines, block_rules)
            if url == COSMETIC_SOURCE_URL:
                cosmetic = parse_cosmetic_lines(lines + EXTRA_COSMETIC_LINES)
        except Exception as e:
            error = e
            failed_urls.append(url)
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

    if strict:
        if failed_urls:
            raise RuntimeError(f"Không tải được: {', '.join(failed_urls)} - đã giữ nguyên bộ lọc cũ.")
        existing = count_existing_domains(ext_dir)
        if total < existing * (1 - MAX_SHRINK_RATIO):
            raise RuntimeError(f"Số tên miền tụt từ {existing} xuống {total} - đã giữ nguyên bộ lọc cũ.")

    # Bỏ các quy tắc thừa: tên miền của chúng đã bị chặn toàn bộ
    any_set = set(any_list)
    needed_block_rules = [
        rule for rule in block_rules.values()
        if not is_covered_by(host_of_pattern(rule["condition"]["urlFilter"]) or '', any_set)
    ]
    rules = build_rules(sorted(any_list), sorted(third_list), list(exceptions.values()), needed_block_rules)
    popup_list = sorted(d for d in popup if d not in popup_exceptions)
    write_json_atomic(os.path.join(ext_dir, "rules.json"), rules)
    write_json_atomic(os.path.join(ext_dir, "popup_domains.json"), popup_list)

    # Không tải được ABPVN thì giữ nguyên cosmetic_rules.js cũ thay vì xóa hết quy tắc ẩn
    if cosmetic is not None:
        cosmetic["generichide"] = sorted(generichide)
        write_text_atomic(
            os.path.join(ext_dir, "cosmetic_rules.js"),
            "// File sinh tự động bởi filter_compiler.py, không sửa tay\n"
            f"const PB_COSMETIC = {to_compact_json(cosmetic)};\n"
        )

    return {
        "domain_count": total,
        "third_party_count": len(third_list),
        "popup_count": len(popup_list),
        "exception_count": len(exceptions),
        "block_rule_count": len(needed_block_rules),
        "cosmetic_count": (
            len(cosmetic["generic"]) + sum(len(v) for v in cosmetic["sites"].values())
            if cosmetic is not None else 0
        ),
        "rule_count": len(rules)
    }
