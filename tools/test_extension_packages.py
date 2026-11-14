"""Phone ZIPs must carry the version and exact bytes that were tested."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "extensions/local-suite/tools/package.py"
FOLDERS = ("listening-stats", "sort-play", "genres", "playlist-plus", "bookmarks-plus")


class ExtensionPackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repository = Path(self.temporary.name)
        self.root = self.repository / "extensions/local-suite"
        (self.root / "tools").mkdir(parents=True)
        (self.repository / "build-versions.json").write_text(json.dumps({"suiteVersion":"0.1.8","shuffleVersion":"0.1.10"}))
        shutil.copyfile(SCRIPT, self.root / "tools/package.py")
        (self.root / "package.json").write_text('{"version":"0.1.8"}')
        self.suite = self.root / "build/SpotifyPlus-Local-Extensions"
        for folder in FOLDERS:
            self.extension(self.suite / folder, "com.wamako." + folder, "0.1.8")
        for name in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "VALIDATION.md"):
            (self.suite / name).write_text("Retained packaging notice: " + name + "\n")
        self.shuffle = self.root / "build/SpotifyPlus-ShufflePlus/shuffle-plus"
        self.extension(self.shuffle, "com.wamako.shuffleplus", "0.1.10")

    @staticmethod
    def extension(folder, identity, version):
        folder.mkdir(parents=True)
        (folder / "manifest.json").write_text(json.dumps({"id": identity, "version": version, "api": 2, "main": "index.js"}))
        (folder / "index.js").write_text("// Tested fixture bytes: café 🎵\n")

    def run_packager(self):
        return subprocess.run([sys.executable, str(self.root / "tools/package.py")], capture_output=True, text=True)

    def test_packages_use_manifest_versions_and_preserve_the_tested_payloads(self):
        result = self.run_packager()
        self.assertEqual(result.returncode, 0, result.stderr)
        for filename, source, prefix in (
            ("SpotifyPlus-Local-Extensions-0.1.8.zip", self.suite, "SpotifyPlus-Local-Extensions/"),
            ("SpotifyPlus-ShufflePlus-0.1.10.zip", self.shuffle, "shuffle-plus/"),
        ):
            target = self.root / "artifacts" / filename
            self.assertTrue(target.is_file(), "The current versioned phone ZIP was not produced")
            with zipfile.ZipFile(target) as archive:
                self.assertIsNone(archive.testzip())
                for path in source.rglob("*"):
                    if path.is_file():
                        self.assertEqual(archive.read(prefix + path.relative_to(source).as_posix()), path.read_bytes())

    def test_mixed_suite_versions_fail_before_any_phone_zip_is_written(self):
        path = self.suite / FOLDERS[0] / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest["version"] = "0.1.7"
        path.write_text(json.dumps(manifest))
        self.assertNotEqual(self.run_packager().returncode, 0)
        self.assertFalse(list((self.root / "artifacts").glob("*.zip")))

    def test_stale_shuffle_version_fails_before_any_phone_zip_is_written(self):
        path = self.shuffle / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest["version"] = "0.1.9"
        path.write_text(json.dumps(manifest))
        self.assertNotEqual(self.run_packager().returncode, 0)
        self.assertFalse(list((self.root / "artifacts").glob("*.zip")))

    def test_packaging_is_reproducible_when_source_timestamps_change(self):
        first = self.run_packager()
        self.assertEqual(first.returncode, 0, first.stderr)
        def digests():
            return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.root / "artifacts").glob("*.zip")}
        before = digests()
        for path in self.root.rglob("index.js"):
            os.utime(path, (123456789, 123456789))
        second = self.run_packager()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(digests(), before)
