import sys
sys.dont_write_bytecode = True
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')

import os
import json
import zipfile

def create_store_package():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, "dist")
    os.makedirs(dist_dir, exist_ok=True)

    manifest_path = os.path.join(base_dir, "manifest.json")
    if not os.path.isfile(manifest_path):
        print("❌ Không tìm thấy manifest.json!")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    version = manifest.get("version", "3.0.0")
    zip_name = f"PopupBlockerPro_v{version}.zip"
    zip_path = os.path.join(dist_dir, zip_name)

    # Danh sách các tệp và thư mục cốt lõi của tiện ích
    include_files = [
        "manifest.json",
        "background.js",
        "shared.js",
        "bridge.js",
        "inject.js",
        "popup.html",
        "popup.js",
        "qr.html",
        "qr.js",
        "donate.html",
        "momo-qr.png",
        "privacy.html",
        "rules.json",
        "popup_domains.json",
        "cosmetic_rules.js",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md"
    ]
    include_dirs = [
        "icons",
        "vendor",
        "LICENSES"
    ]

    print(f"📦 Đang đóng gói tệp {zip_name} cho Chrome Web Store / Edge Add-ons...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in include_files:
            file_path = os.path.join(base_dir, f)
            if os.path.isfile(file_path):
                zf.write(file_path, arcname=f)
                print(f"  + Đã thêm file: {f}")

        for d in include_dirs:
            dir_path = os.path.join(base_dir, d)
            if os.path.isdir(dir_path):
                for root, _, files in os.walk(dir_path):
                    for file in files:
                        if not file.startswith("_"):
                            full_path = os.path.join(root, file)
                            rel_path = os.path.relpath(full_path, base_dir)
                            zf.write(full_path, arcname=rel_path)
                            print(f"  + Đã thêm: {rel_path}")

    zip_size_kb = os.path.getsize(zip_path) / 1024
    print(f"\n✅ Đóng gói hoàn tất thành công!")
    print(f"📁 Tệp ZIP: {zip_path} ({zip_size_kb:.1f} KB)")
    print(f"👉 Bạn có thể dùng tệp này nộp trực tiếp lên Chrome Web Store Developer Dashboard hoặc Edge Add-ons.")

if __name__ == "__main__":
    create_store_package()
