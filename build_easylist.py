import sys
sys.dont_write_bytecode = True
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')

import os

from filter_compiler import compile_filters


def report_progress(idx, total, url, error):
    if error:
        print(f"⚠️ ({idx}/{total}) Không thể tải {url}: {error}")
    else:
        print(f"✅ ({idx}/{total}) Đã trích xuất từ: {url}")


if __name__ == "__main__":
    ext_dir = os.path.dirname(os.path.abspath(__file__))
    print("⏳ Đang tải bộ lọc EasyList, ABPVN & Fanboy Cookie mới nhất...")
    try:
        stats = compile_filters(ext_dir, progress=report_progress)
    except RuntimeError as e:
        print(f"❌ {e}")
        sys.exit(1)
    print(
        f"🎉 Hoàn tất! Đã ghi {stats['rule_count']} cụm quy tắc "
        f"({stats['domain_count']} tên miền, trong đó {stats['third_party_count']} chỉ chặn third-party) vào rules.json"
    )
    print(f"🪟 Đã ghi {stats['popup_count']} tên miền popup quảng cáo vào popup_domains.json")
