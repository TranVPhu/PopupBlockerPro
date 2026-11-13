import sys
sys.dont_write_bytecode = True
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')

import os
import re

VERSION_LINE = re.compile(r'("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")')


def bump_patch(version):
    """3.1.9 -> 3.1.10. Chrome Web Store chỉ nhận số phiên bản lớn hơn bản đã nộp."""
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', version)
    if not match:
        raise ValueError(f"Phiên bản không đúng dạng x.y.z: {version!r}")
    major, minor, patch = map(int, match.groups())
    return f"{major}.{minor}.{patch + 1}"


def bump_manifest(path):
    """Tăng số cuối của "version" trong manifest.json, giữ nguyên mọi thứ còn lại. Trả về phiên bản mới."""
    with open(path, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    matches = VERSION_LINE.findall(text)
    if len(matches) != 1:
        raise ValueError(f'Cần đúng một dòng "version" trong {path}, tìm thấy {len(matches)}')
    _, major, minor, patch, _ = matches[0]
    new_version = bump_patch(f"{major}.{minor}.{patch}")
    text = VERSION_LINE.sub(lambda m: f"{m.group(1)}{new_version}{m.group(5)}", text)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    return new_version


if __name__ == "__main__":
    manifest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest.json")
    print(bump_manifest(manifest))
