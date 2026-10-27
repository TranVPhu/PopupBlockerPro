import sys
sys.dont_write_bytecode = True

import os
import re
import json
import urllib.request

# Nguồn danh sách EasyList quốc tế và ABPVN (Việt Nam)
FILTER_LIST_URLS = [
    "https://easylist.to/easylist/easylist.txt",
    "https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt"
]

# Khớp các quy tắc chặn tên miền dạng chuẩn EasyList: ||example.com^
DOMAIN_RULE_REGEX = re.compile(r"^\|\|([a-z0-9.-]+\.[a-z]{2,})\^(\$third-party)?$")

def fetch_and_compile_rules(output_path, max_domains=15000):
    print("⏳ Đang tải bộ lọc EasyList & ABPVN mới nhất...")
    blocked_domains = set()

    for url in FILTER_LIST_URLS:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as response:
                lines = response.read().decode('utf-8', errors='ignore').splitlines()
                for line in lines:
                    line = line.strip()
                    # Bỏ qua comment, quy tắc ngoại lệ (@@) hoặc quy tắc CSS (##)
                    if not line or line.startswith(('!', '[', '@@')) or '##' in line or '#@#' in line:
                        continue
                    match = DOMAIN_RULE_REGEX.match(line)
                    if match:
                        blocked_domains.add(match.group(1))
                        if len(blocked_domains) >= max_domains:
                            break
            print(f"✅ Đã trích xuất từ: {url}")
        except Exception as e:
            print(f"⚠️ Không thể tải {url}: {e}")

    domain_list = sorted(list(blocked_domains))
    print(f"📦 Tổng số tên miền quảng cáo thu thập được: {len(domain_list)}")

    # Khởi tạo các quy tắc chuyên biệt cho Video Ads (VAST/IMA) & Banner Path
    rules = [
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
                "urlFilter": "*preroll*",
                "resourceTypes": ["media", "xmlhttprequest", "script"]
            }
        }
    ]

    # Chia danh sách tên miền thành từng cụm (mỗi rule chứa 500 domain để tối ưu tốc độ)
    CHUNK_SIZE = 500
    rule_id = 10
    for i in range(0, len(domain_list), CHUNK_SIZE):
        chunk = domain_list[i:i + CHUNK_SIZE]
        rules.append({
            "id": rule_id,
            "priority": 1,
            "action": {"type": "block"},
            "condition": {
                "requestDomains": chunk,
                "resourceTypes": [
                    "script", "sub_frame", "image", "xmlhttprequest", "media"
                ]
            }
        })
        rule_id += 1

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(rules, f, indent=2)

    print(f"🎉 Hoàn tất! Đã ghi {len(rules)} cụm quy tắc (chứa {len(domain_list)} tên miền) vào: {output_path}")

if __name__ == "__main__":
    target_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "PopupBlockerPro", "rules.json")
    fetch_and_compile_rules(target_file)