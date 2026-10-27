import sys
sys.dont_write_bytecode = True

import os
import shutil
import threading
import subprocess
import tkinter as tk
from tkinter import messagebox, filedialog

from filter_compiler import compile_filters

def get_app_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

# Tự động dọn dẹp thư mục __pycache__ vì Chrome cấm thư mục có tiền tố '_' trong Extension
_app_dir = get_app_dir()
_pycache_path = os.path.join(_app_dir, "__pycache__")
if os.path.exists(_pycache_path):
    try:
        shutil.rmtree(_pycache_path)
    except Exception:
        pass

# Bảng định danh các trình duyệt nhân Chromium phổ biến.
# supports_load_flag=False: trình duyệt đã bỏ cờ --load-extension (Google Chrome bản chính thức từ v137)
CHROMIUM_BROWSERS = [
    {
        "name": "Google Chrome",
        "exe": "chrome.exe",
        "ext_url": "chrome://extensions",
        "supports_load_flag": False,
        "paths": [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
        ]
    },
    {
        "name": "Microsoft Edge",
        "exe": "msedge.exe",
        "ext_url": "edge://extensions",
        "paths": [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe")
        ]
    },
    {
        "name": "Cốc Cốc Browser",
        "exe": "browser.exe",
        "ext_url": "coccoc://extensions",
        "paths": [
            r"C:\Program Files\CocCoc\Browser\Application\browser.exe",
            r"C:\Program Files (x86)\CocCoc\Browser\Application\browser.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\CocCoc\Browser\Application\browser.exe")
        ]
    },
    {
        "name": "Brave Browser",
        "exe": "brave.exe",
        "ext_url": "brave://extensions",
        "paths": [
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe")
        ]
    },
    {
        "name": "Vivaldi",
        "exe": "vivaldi.exe",
        "ext_url": "vivaldi://extensions",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"),
            r"C:\Program Files\Vivaldi\Application\vivaldi.exe"
        ]
    },
    {
        "name": "Opera / Opera GX",
        "exe": "opera.exe",
        "ext_url": "opera://extensions",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Opera\opera.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Opera GX\opera.exe"),
            r"C:\Program Files\Opera\opera.exe"
        ]
    }
]

def scan_installed_browsers():
    detected = []
    seen_paths = set()

    for b in CHROMIUM_BROWSERS:
        for p in b["paths"]:
            if os.path.isfile(p) and p.lower() not in seen_paths:
                seen_paths.add(p.lower())
                detected.append({
                    "name": b["name"],
                    "path": p,
                    "ext_url": b["ext_url"],
                    "supports_load_flag": b.get("supports_load_flag", True)
                })
                break

    if sys.platform == "win32":
        import winreg
        for b in CHROMIUM_BROWSERS:
            try:
                key_path = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{b['exe']}"
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                    exe_path, _ = winreg.QueryValueEx(key, "")
                    exe_path = exe_path.strip('"')
                    if os.path.isfile(exe_path) and exe_path.lower() not in seen_paths:
                        seen_paths.add(exe_path.lower())
                        detected.append({
                            "name": b["name"] + " (Registry)",
                            "path": exe_path,
                            "ext_url": b["ext_url"],
                            "supports_load_flag": b.get("supports_load_flag", True)
                        })
            except OSError:
                continue

    return detected


class ExtensionInstallerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Trình Quản Lý & Cài Đặt Extension Chặn Quảng Cáo")
        self.root.geometry("700x560")
        self.root.configure(bg="#1e1e2e")
        self.root.resizable(False, False)

        base_dir = get_app_dir()
        candidate_dirs = [
            base_dir,
            os.path.abspath(os.path.join(base_dir, "..")),
            os.path.join(base_dir, "PopupBlockerPro"),
            os.path.abspath(os.path.join(base_dir, "..", "PopupBlockerPro"))
        ]
        default_ext_dir = ""
        for c in candidate_dirs:
            if os.path.isfile(os.path.join(c, "manifest.json")):
                default_ext_dir = c
                break

        ico_candidates = [
            os.path.join(base_dir, "icons", "icon.ico"),
            os.path.join(default_ext_dir, "icons", "icon.ico") if default_ext_dir else "",
            os.path.join(getattr(sys, '_MEIPASS', ''), "icons", "icon.ico")
        ]
        for ip in ico_candidates:
            if ip and os.path.isfile(ip):
                try:
                    self.root.iconbitmap(ip)
                    break
                except Exception:
                    pass

        self.ext_dir = tk.StringVar(value=default_ext_dir)
        self.status_var = tk.StringVar(value="💡 Sẵn sàng. Bạn có thể cập nhật EasyList trước khi cài đặt.")

        self.browser_vars = []
        self.setup_ui()
        self.refresh_browsers()

    def setup_ui(self):
        # Tiêu đề
        tk.Label(
            self.root, text="🛡️ TRÌNH CÀI ĐẶT & CẬP NHẬT BỘ LỌC QUẢNG CÁO",
            font=("Segoe UI", 14, "bold"), bg="#1e1e2e", fg="#89b4fa"
        ).pack(pady=(14, 4))

        tk.Label(
            self.root, text="Hỗ trợ rà soát trình duyệt Chromium, cập nhật EasyList + ABPVN & Click chuột phải ẩn quảng cáo",
            font=("Segoe UI", 9), bg="#1e1e2e", fg="#a6adc8"
        ).pack(pady=(0, 10))

        # 1. Chọn thư mục Extension
        dir_frame = tk.LabelFrame(
            self.root, text=" 1. Thư mục mã nguồn Extension (PopupBlockerPro) ",
            font=("Segoe UI", 9, "bold"), bg="#1e1e2e", fg="#f9e2af", padx=10, pady=8
        )
        dir_frame.pack(fill="x", padx=20, pady=4)

        tk.Entry(
            dir_frame, textvariable=self.ext_dir, font=("Segoe UI", 9),
            bg="#313244", fg="#cdd6f4", relief="flat"
        ).pack(side="left", fill="x", expand=True, ipady=4, padx=(0, 8))

        tk.Button(
            dir_frame, text="Chọn thư mục...", command=self.browse_folder,
            bg="#45475a", fg="#ffffff", relief="flat", padx=10, cursor="hand2"
        ).pack(side="right")

        # 2. Khung Cập nhật EasyList & ABPVN trực tiếp
        filter_frame = tk.LabelFrame(
            self.root, text=" 2. Cập nhật CSDL Quảng Cáo (EasyList Quốc Tế + ABPVN Việt Nam) ",
            font=("Segoe UI", 9, "bold"), bg="#1e1e2e", fg="#fab387", padx=10, pady=8
        )
        filter_frame.pack(fill="x", padx=20, pady=6)

        self.status_lbl = tk.Label(
            filter_frame, textvariable=self.status_var,
            font=("Segoe UI", 9), bg="#1e1e2e", fg="#cdd6f4", anchor="w"
        )
        self.status_lbl.pack(side="left", fill="x", expand=True)

        self.update_btn = tk.Button(
            filter_frame, text="🌐 Tải & Cập nhật EasyList vào rules.json",
            command=self.start_easylist_update,
            font=("Segoe UI", 9, "bold"), bg="#fab387", fg="#11111b",
            relief="flat", padx=12, pady=5, cursor="hand2"
        )
        self.update_btn.pack(side="right")

        # 3. Danh sách trình duyệt phát hiện
        list_frame = tk.LabelFrame(
            self.root, text=" 3. Các trình duyệt nhân Chromium phát hiện trên máy ",
            font=("Segoe UI", 9, "bold"), bg="#1e1e2e", fg="#a6e3a1", padx=10, pady=8
        )
        list_frame.pack(fill="both", expand=True, padx=20, pady=6)

        self.browser_container = tk.Frame(list_frame, bg="#181825")
        self.browser_container.pack(fill="both", expand=True)

        # 4. Nút hành động cài đặt
        btn_frame = tk.Frame(self.root, bg="#1e1e2e")
        btn_frame.pack(fill="x", padx=20, pady=12)

        tk.Button(
            btn_frame, text="🔄 Quét lại máy", command=self.refresh_browsers,
            font=("Segoe UI", 9, "bold"), bg="#585b70", fg="#ffffff",
            relief="flat", padx=12, pady=8, cursor="hand2"
        ).pack(side="left")

        tk.Button(
            btn_frame, text="⚡ Chạy kèm Extension & Tạo Shortcut Desktop",
            command=self.launch_and_create_shortcut,
            font=("Segoe UI", 9, "bold"), bg="#89b4fa", fg="#11111b",
            relief="flat", padx=14, pady=8, cursor="hand2"
        ).pack(side="right", padx=(8, 0))

        tk.Button(
            btn_frame, text="📌 Mở trang Cài đặt cố định",
            command=self.open_extensions_page,
            font=("Segoe UI", 9, "bold"), bg="#a6e3a1", fg="#11111b",
            relief="flat", padx=14, pady=8, cursor="hand2"
        ).pack(side="right")

    def browse_folder(self):
        folder = filedialog.askdirectory(title="Chọn thư mục PopupBlockerPro chứa manifest.json")
        if folder:
            self.ext_dir.set(folder)

    def start_easylist_update(self):
        ext_path = self.ext_dir.get().strip()
        if not ext_path or not os.path.isdir(ext_path):
            messagebox.showerror("Lỗi", "Vui lòng chọn thư mục PopupBlockerPro hợp lệ trước khi cập nhật!")
            return

        self.update_btn.config(state="disabled", text="⏳ Đang tải dữ liệu...")
        self.status_var.set("⏳ Đang kết nối máy chủ EasyList & ABPVN...")

        # Chạy trong luồng riêng để giao diện không bị treo
        threading.Thread(target=self._download_and_compile_worker, args=(ext_path,), daemon=True).start()

    def _download_and_compile_worker(self, ext_path):
        def on_progress(idx, total, url, error):
            if error:
                print(f"Không thể tải {url}: {error}")
            self.root.after(0, lambda: self.status_var.set(f"⏳ Đã xử lý nguồn ({idx}/{total})..."))

        try:
            stats = compile_filters(ext_path, progress=on_progress)
            self.root.after(0, lambda: self._on_update_done(True, stats["domain_count"], stats["rule_count"]))
        except Exception as err:
            self.root.after(0, lambda e=str(err): self._on_update_done(False, 0, 0, e))

    def _on_update_done(self, success, domain_count, rule_count, err_msg=""):
        self.update_btn.config(state="normal", text="🌐 Tải & Cập nhật EasyList vào rules.json")
        if success:
            self.status_var.set(f"✅ Đã nạp thành công {domain_count:,} tên miền quảng cáo ({rule_count} cụm quy tắc)!")
            messagebox.showinfo(
                "Cập nhật EasyList + ABPVN hoàn tất!",
                f"Đã biên dịch thành công {domain_count:,} tên miền quảng cáo vào file rules.json!\n\n"
                f"Nếu trình duyệt đang mở, hãy bấm nút Tải lại (Reload) tiện ích trong trang quản lý Extension."
            )
        else:
            self.status_var.set("❌ Cập nhật thất bại, đã giữ nguyên rules.json cũ!")
            messagebox.showerror("Lỗi cập nhật", f"Không thể cập nhật rules.json:\n{err_msg}")

    def refresh_browsers(self):
        for widget in self.browser_container.winfo_children():
            widget.destroy()
        self.browser_vars.clear()

        browsers = scan_installed_browsers()
        if not browsers:
            tk.Label(
                self.browser_container, text="Không tìm thấy trình duyệt nhân Chromium nào trên máy!",
                bg="#181825", fg="#f38ba8", font=("Segoe UI", 10)
            ).pack(pady=30)
            return

        for b in browsers:
            var = tk.BooleanVar(value=True)
            row = tk.Frame(self.browser_container, bg="#181825", pady=5, padx=8)
            row.pack(fill="x")

            tk.Checkbutton(
                row, text=f"{b['name']}", variable=var,
                font=("Segoe UI", 10, "bold"), bg="#181825", fg="#cdd6f4",
                selectcolor="#313244", activebackground="#181825", activeforeground="#89b4fa"
            ).pack(side="left")

            tk.Label(
                row, text=b["path"], font=("Consolas", 8), bg="#181825", fg="#6c7086"
            ).pack(side="right")

            self.browser_vars.append((var, b))

    def validate_selection(self):
        ext_path = self.ext_dir.get().strip()
        if not ext_path or not os.path.isfile(os.path.join(ext_path, "manifest.json")):
            messagebox.showerror(
                "Thiếu file manifest.json",
                "Thư mục bạn chọn không chứa file 'manifest.json'!\nHãy chọn đúng thư mục PopupBlockerPro."
            )
            return None, None

        selected = [b for var, b in self.browser_vars if var.get()]
        if not selected:
            messagebox.showwarning("Chưa chọn trình duyệt", "Vui lòng tích chọn ít nhất 1 trình duyệt!")
            return None, None

        return ext_path, selected

    def launch_and_create_shortcut(self):
        ext_path, selected = self.validate_selection()
        if not ext_path:
            return

        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        unsupported = [b for b in selected if not b.get("supports_load_flag", True)]
        selected = [b for b in selected if b.get("supports_load_flag", True)]

        for b in selected:
            try:
                subprocess.Popen([b["path"], f"--load-extension={ext_path}"])
            except Exception as e:
                print(f"Lỗi khởi chạy {b['name']}: {e}")

            safe_name = b["name"].replace(" ", "_").replace("/", "")
            bat_path = os.path.join(desktop, f"Chay_{safe_name}_Chan_Popup.bat")
            try:
                with open(bat_path, "w", encoding="utf-8") as f:
                    f.write(f'@echo off\nstart "" "{b["path"]}" --load-extension="{ext_path}"\n')
            except Exception:
                pass

        message = ""
        if selected:
            message += (
                f"Đã nạp trực tiếp Extension vào {len(selected)} trình duyệt và tạo Shortcut ngoài Desktop!\n"
                f"Lưu ý: nếu trình duyệt đang mở sẵn, hãy đóng hẳn rồi chạy lại bằng Shortcut thì Extension mới được nạp.\n\n"
            )
        if unsupported:
            names = ", ".join(b["name"] for b in unsupported)
            message += (
                f"{names} không còn hỗ trợ nạp Extension qua dòng lệnh (--load-extension).\n"
                f"Hãy dùng nút \"📌 Mở trang Cài đặt cố định\" để cài vĩnh viễn bằng Load unpacked."
            )
        messagebox.showinfo("Kết quả kích hoạt", message.strip())

    def open_extensions_page(self):
        ext_path, selected = self.validate_selection()
        if not ext_path:
            return

        self.root.clipboard_clear()
        self.root.clipboard_append(ext_path)
        self.root.update()

        for b in selected:
            try:
                subprocess.Popen([b["path"], b["ext_url"]])
            except Exception:
                pass

        messagebox.showinfo(
            "Đã copy sẵn đường dẫn cài đặt!",
            f"Đường dẫn thư mục Extension đã được COPY SẴN vào Clipboard:\n{ext_path}\n\n"
            f"Trên trình duyệt vừa mở:\n"
            f"1. Bật 'Developer mode' (Chế độ nhà phát triển).\n"
            f"2. Bấm 'Load unpacked' (Tải tiện ích đã giải nén).\n"
            f"3. Nhấn Ctrl + V rồi bấm Enter là hoàn tất!"
        )

if __name__ == "__main__":
    root = tk.Tk()
    app = ExtensionInstallerGUI(root)
    root.mainloop()