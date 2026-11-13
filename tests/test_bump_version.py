import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import bump_version as bv


class BumpPatchTest(unittest.TestCase):
    def test_increments_the_last_number(self):
        self.assertEqual(bv.bump_patch("3.1.1"), "3.1.2")
        self.assertEqual(bv.bump_patch("3.1.9"), "3.1.10", "so sánh theo số, không phải theo chữ")
        self.assertEqual(bv.bump_patch("0.0.0"), "0.0.1")

    def test_rejects_other_shapes(self):
        for bad in ("3.1", "3.1.1.1", "v3.1.1", "3.1.x", ""):
            with self.assertRaises(ValueError, msg=bad):
                bv.bump_patch(bad)


class BumpManifestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "manifest.json")

    def write(self, text):
        with open(self.path, "w", encoding="utf-8", newline="") as f:
            f.write(text)

    def read(self):
        with open(self.path, encoding="utf-8", newline="") as f:
            return f.read()

    def test_changes_only_the_version_line(self):
        original = '{\r\n    "manifest_version": 3,\r\n    "name": "Tên có dấu",\r\n    "version": "3.1.1",\r\n    "minimum_chrome_version": "119"\r\n}\r\n'
        self.write(original)
        self.assertEqual(bv.bump_manifest(self.path), "3.1.2")
        self.assertEqual(self.read(), original.replace('"3.1.1"', '"3.1.2"'), "định dạng và dấu xuống dòng phải giữ nguyên")
        self.assertEqual(json.loads(self.read())["version"], "3.1.2")

    def test_repeated_bumps_keep_counting(self):
        self.write('{"version": "3.1.9"}')
        bv.bump_manifest(self.path)
        self.assertEqual(bv.bump_manifest(self.path), "3.1.11")

    def test_refuses_when_version_is_missing_or_ambiguous(self):
        for text in ('{"name": "x"}', '{"version": "1.0.0", "other": {"version": "2.0.0"}}', '{"version": "1.0"}'):
            self.write(text)
            with self.assertRaises(ValueError, msg=text):
                bv.bump_manifest(self.path)
            self.assertEqual(self.read(), text, "không được sửa file khi từ chối")

    def test_real_manifest_has_a_bumpable_version(self):
        real = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "manifest.json")
        with open(real, encoding="utf-8") as f:
            version = json.load(f)["version"]
        self.assertRegex(bv.bump_patch(version), r"^\d+\.\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()
