#!/usr/bin/env python3
"""Regression checks for Wave 3 (Phase 3.4) Japanese Kanji romanization patch."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apply_wave3_updates

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_JS = ROOT / "app/api2-assets/api2-extensions/beautiful-lyrics/index.js"


class Wave3AssetsTests(unittest.TestCase):
    def test_patch_is_idempotent_on_beautiful_lyrics_bundle(self):
        sample = (
            'function localRomanization(text, language) {\n'
            '  const code = languageCode(language).split("-")[0];\n'
            '  if (!supportsPronunciation(language)) return void 0;\n'
            '  if (code === "ja") return /[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{20000}-\\u{323af}]/u.test(text) ? void 0 : (0, import_wanakana.toRomaji)(text);\n'
            '  return text;\n'
            '}\n'
        )
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp) / "index.js"
            bundle.write_text(sample, encoding="utf-8")
            self.assertTrue(apply_wave3_updates.patch_beautiful_lyrics_bundle(bundle))
            first = bundle.read_text(encoding="utf-8")
            self.assertIn(apply_wave3_updates.MARKER, first)
            self.assertIn("__w3JaRomanize(text,", first)
            # Second pass must be a no-op
            self.assertFalse(apply_wave3_updates.patch_beautiful_lyrics_bundle(bundle))
            self.assertEqual(bundle.read_text(encoding="utf-8"), first)

    def test_staged_beautiful_lyrics_contains_ja_kanji_fallback_and_valid_js(self):
        self.assertTrue(BUNDLE_JS.is_file(), f"Missing {BUNDLE_JS}")
        content = BUNDLE_JS.read_text(encoding="utf-8")
        self.assertIn(apply_wave3_updates.MARKER, content)
        node = shutil.which("node")
        self.assertIsNotNone(node, "node must be on PATH to execute JS smoke check")
        # Extract the injected helper function and execute it against Kanji lyrics in Node
        marker_idx = content.index(apply_wave3_updates.MARKER)
        anchor_idx = content.index("function localRomanization(text, language)", marker_idx)
        helper_js = content[marker_idx:anchor_idx]
        script = (
            helper_js
            + "\nconst toRomajiMock = (s) => s.replace(/の/g, 'no').replace(/と/g, 'to').replace(/さくら/g, 'sakura');\n"
            + "const res = __w3JaRomanize('君の夜空と涙さくら', toRomajiMock);\n"
            + "if (!res || !res.includes('kimi') || !res.includes('yozora') || !res.includes('namida') || !res.includes('sakura')) {\n"
            + "  throw new Error('Unexpected romanization: ' + res);\n"
            + "}\n"
            + "if (__w3JaRomanize('龍龘齉', (x) => x) !== undefined) {\n"
            + "  throw new Error('Unmapped pure kanji must return undefined');\n"
            + "}\n"
        )
        proc = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)


if __name__ == "__main__":
    unittest.main()
