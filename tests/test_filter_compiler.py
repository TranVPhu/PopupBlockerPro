import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import filter_compiler as fc


class ParseExceptionTest(unittest.TestCase):
    def rule(self, line):
        kind, value = fc.parse_exception_line(line)
        self.assertEqual(kind, "rule")
        return value

    def test_allow_rule_with_types_and_domains(self):
        rule = self.rule("@@||x.com/ads.js$script,image,domain=a.vn|b.vn|~c.a.vn")
        self.assertEqual(rule["action"]["type"], "allow")
        self.assertEqual(rule["condition"], {
            "urlFilter": "||x.com/ads.js",
            "resourceTypes": ["script", "image"],
            "initiatorDomains": ["a.vn", "b.vn"],
            "excludedInitiatorDomains": ["c.a.vn"]
        })

    def test_party_options(self):
        self.assertEqual(self.rule("@@||x.com^$~third-party")["condition"]["domainType"], "firstParty")
        self.assertEqual(self.rule("@@||x.com^$third-party")["condition"]["domainType"], "thirdParty")

    def test_excluded_types(self):
        self.assertEqual(self.rule("@@||x.com^$~image")["condition"]["excludedResourceTypes"], ["image"])

    def test_document_allows_whole_page(self):
        rule = self.rule("@@||x.com^$document")
        self.assertEqual(rule["action"]["type"], "allowAllRequests")
        self.assertEqual(rule["condition"]["resourceTypes"], ["main_frame", "sub_frame"])

    def test_generichide_and_popup_are_not_network_rules(self):
        self.assertEqual(fc.parse_exception_line("@@||tinhte.vn$generichide"), ("generichide", "tinhte.vn"))
        self.assertEqual(fc.parse_exception_line("@@||x.com^$popup"), ("popup", "x.com"))

    def test_unsupported_forms_are_skipped(self):
        for line in (
            "@@/regex[0-9]/$script",
            "@@||x.com^$csp=script-src 'self'",
            "@@||x.com^$removeparam=a",
            "@@||*bad.com^",
            "@@||việt.vn^",
            "@@||x.com^$domain=google.*"
        ):
            self.assertIsNone(fc.parse_exception_line(line), line)


class ParseBlockRuleTest(unittest.TestCase):
    def parse(self, *lines):
        rules = {}
        fc.parse_block_rule_lines(list(lines), rules)
        return list(rules.values())

    def test_options_and_paths(self):
        rules = self.parse(
            "||tracker.com^$script,third-party,xmlhttprequest",
            "||site.com/ads/banner.js",
            "||site.com/x.js$domain=a.vn"
        )
        self.assertEqual(rules[0]["condition"], {
            "urlFilter": "||tracker.com^", "domainType": "thirdParty", "resourceTypes": ["script", "xmlhttprequest"]
        })
        self.assertEqual(rules[1]["condition"], {"urlFilter": "||site.com/ads/banner.js"})
        self.assertEqual(rules[2]["condition"]["initiatorDomains"], ["a.vn"])

    def test_skips_what_other_steps_handle_or_is_too_risky(self):
        self.assertEqual(self.parse(
            "||plain.com^",
            "||plain.com^$third-party",
            "||popup.com^$popup",
            "||nav.com^$document",
            "||r.com/x$redirect=noop.js",
            "-ad-sidebar.$image",
            "/regex/$script",
            "@@||allow.com/x",
            "a.vn##.x",
            "||việt.vn/x"
        ), [])

    def test_redundant_rules_dropped_when_domain_already_blocked(self):
        self.assertTrue(fc.is_covered_by(fc.host_of_pattern("||cdn.ads.com/x.js"), {"ads.com"}))
        self.assertFalse(fc.is_covered_by(fc.host_of_pattern("||badads.com/x.js"), {"ads.com"}))
        self.assertFalse(fc.is_covered_by(fc.host_of_pattern("||cache.*/x") or '', {"ads.com"}))


class ParseCosmeticTest(unittest.TestCase):
    def test_classifies_rules(self):
        result = fc.parse_cosmetic_lines([
            "! comment",
            "##.generic",
            "###ad-id",
            "~a.vn,~b.vn##.except",
            "a.vn,b.vn##.site",
            "a.vn#@#.unhide"
        ])
        self.assertEqual(result["generic"], [
            {"s": ".generic", "x": []},
            {"s": "#ad-id", "x": []},
            {"s": ".except", "x": ["a.vn", "b.vn"]}
        ])
        self.assertEqual(result["sites"], {"a.vn": [".site"], "b.vn": [".site"]})
        self.assertEqual(result["unhide"], {"a.vn": [".unhide"]})

    def test_rejects_css_injection_and_adblocker_only_syntax(self):
        result = fc.parse_cosmetic_lines([
            "a.vn##.x{background:url(https://evil/?)}",
            "a.vn##.x:has-text(ads)",
            "a.vn##.x:-abp-contains(ads)",
            "a.vn##+js(noop)",
            "google.*##.wildcard",
            "||x.com/path##frag"
        ])
        self.assertEqual(result, {"generic": [], "sites": {}, "unhide": {}})


class BuildRulesTest(unittest.TestCase):
    def test_ids_unique_and_exceptions_outrank_blocks(self):
        exception = {"action": {"type": "allow"}, "condition": {"urlFilter": "||x.com^"}}
        rules = fc.build_rules(["a.com"] * 1200, ["b.com"], [exception])
        self.assertEqual(len({r["id"] for r in rules}), len(rules))
        blocks = [r for r in rules if r["action"]["type"] == "block"]
        allows = [r for r in rules if r["action"]["type"] == "allow"]
        self.assertGreater(allows[0]["priority"], max(r["priority"] for r in blocks))
        self.assertGreaterEqual(allows[0]["id"], fc.EXCEPTION_RULE_ID_START)
        self.assertLess(max(r["id"] for r in blocks), fc.EXCEPTION_RULE_ID_START)

    def test_third_party_rules_have_domain_type(self):
        rules = fc.build_rules(["a.com"], ["b.com"])
        by_domain = {r["condition"]["requestDomains"][0]: r for r in rules if "requestDomains" in r["condition"]}
        self.assertNotIn("domainType", by_domain["a.com"]["condition"])
        self.assertEqual(by_domain["b.com"]["condition"]["domainType"], "thirdParty")


class CompileFiltersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.original_download = fc.download_list
        self.addCleanup(setattr, fc, "download_list", self.original_download)
        self.good_list = [f"||ad{i}.com^" for i in range(fc.MIN_DOMAINS + 5)] + [
            "||x-popup.com^$popup", "||y-popup.com^$popup", "@@||y-popup.com^$popup",
            "@@||tinhte.vn$generichide", "a.vn##.quang-cao  x"
        ]

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def write_old_files(self):
        for name in ("rules.json", "popup_domains.json", "cosmetic_rules.js"):
            with open(self.path(name), "w", encoding="utf-8") as f:
                f.write("OLD")

    def read(self, name):
        with open(self.path(name), encoding="utf-8") as f:
            return f.read()

    def test_network_failure_keeps_old_files(self):
        self.write_old_files()

        def fail(url, timeout=20):
            raise OSError("no network")
        fc.download_list = fail
        with self.assertRaises(RuntimeError):
            fc.compile_filters(self.tmp.name)
        for name in ("rules.json", "popup_domains.json", "cosmetic_rules.js"):
            self.assertEqual(self.read(name), "OLD", name)
        self.assertEqual([f for f in os.listdir(self.tmp.name) if f.endswith(".tmp")], [])

    def test_abpvn_failure_keeps_cosmetic_file_only(self):
        self.write_old_files()

        def partial(url, timeout=20):
            if url == fc.COSMETIC_SOURCE_URL:
                raise OSError("abpvn down")
            return self.good_list
        fc.download_list = partial
        fc.compile_filters(self.tmp.name)
        self.assertEqual(self.read("cosmetic_rules.js"), "OLD")
        self.assertNotEqual(self.read("rules.json"), "OLD")

    def test_strict_refuses_when_any_source_failed(self):
        self.write_old_files()

        def partial(url, timeout=20):
            if url == fc.COSMETIC_SOURCE_URL:
                raise OSError("abpvn down")
            return self.good_list
        fc.download_list = partial
        with self.assertRaises(RuntimeError):
            fc.compile_filters(self.tmp.name, strict=True)
        self.assertEqual(self.read("rules.json"), "OLD")

    def test_strict_refuses_large_shrink_but_allows_normal_change(self):
        old_rules = [{"condition": {"requestDomains": [f"d{i}.com" for i in range(fc.MIN_DOMAINS * 3)]}}]
        with open(self.path("rules.json"), "w", encoding="utf-8") as f:
            json.dump(old_rules, f)
        fc.download_list = lambda url, timeout=20: self.good_list
        with self.assertRaises(RuntimeError):
            fc.compile_filters(self.tmp.name, strict=True)
        self.assertEqual(json.loads(self.read("rules.json")), old_rules)

        old_rules[0]["condition"]["requestDomains"] = old_rules[0]["condition"]["requestDomains"][:fc.MIN_DOMAINS + 100]
        with open(self.path("rules.json"), "w", encoding="utf-8") as f:
            json.dump(old_rules, f)
        fc.compile_filters(self.tmp.name, strict=True)
        self.assertNotEqual(json.loads(self.read("rules.json")), old_rules)

    def test_full_build_outputs(self):
        fc.download_list = lambda url, timeout=20: self.good_list
        stats = fc.compile_filters(self.tmp.name)
        self.assertGreater(stats["rule_count"], 1)

        popup = json.loads(self.read("popup_domains.json"))
        self.assertIn("x-popup.com", popup)
        self.assertNotIn("y-popup.com", popup, "@@...$popup phải loại tên miền khỏi danh sách")

        js = self.read("cosmetic_rules.js")
        cosmetic = json.loads(js[js.index("{"):js.rindex("}") + 1])
        self.assertIn("tinhte.vn", cosmetic["generichide"])
        self.assertIn("tinhte.vn", cosmetic["sites"], "Thiếu quy tắc bổ sung EXTRA_COSMETIC_LINES")


if __name__ == "__main__":
    unittest.main()
