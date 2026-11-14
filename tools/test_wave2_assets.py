"""Verify Wave 2 patches, bundled Play Next, local-suite assets, and backup/storage routing invariants."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import apply_wave2_updates

ROOT = Path(__file__).resolve().parents[1]


class Wave2AssetTests(unittest.TestCase):
    def test_apply_wave2_updates_is_idempotent_on_api2_source(self):
        src = ROOT / "app/api2-source"
        if not src.exists():
            self.skipTest("app/api2-source not unpacked")
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "api2-source"
            for rel in (
                "app/src/main/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java",
                "app/src/main/java/com/lenerd/spotifyplus/module/hooks/SleepTimerHook.java",
                "app/src/main/java/com/lenerd/spotifyplus/module/scripting/SpotifyServices.java",
                "app/src/main/assets/nodejs-src/loader/script-loader.ts",
                "scripts/settings/src/app.tsx",
            ):
                dst = copy / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src / rel, dst)
            apply_wave2_updates.apply(copy)
            first = {
                rel: (copy / rel).read_text(encoding="utf-8")
                for rel in (
                    "app/src/main/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java",
                    "app/src/main/java/com/lenerd/spotifyplus/module/hooks/SleepTimerHook.java",
                    "app/src/main/java/com/lenerd/spotifyplus/module/scripting/SpotifyServices.java",
                    "app/src/main/assets/nodejs-src/loader/script-loader.ts",
                    "scripts/settings/src/app.tsx",
                )
            }
            apply_wave2_updates.apply(copy)
            for rel, expected in first.items():
                self.assertEqual((copy / rel).read_text(encoding="utf-8"), expected)
            self.assertTrue((copy / "scripts/settings/src/backup-page.tsx").is_file())
            self.assertIn("com.wamako.suite", first["app/src/main/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java"])
            self.assertIn("StorageBackupHelper", first["app/src/main/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java"])
            self.assertIn("trackNativeDuration", first["app/src/main/java/com/lenerd/spotifyplus/module/hooks/SleepTimerHook.java"])
            self.assertIn("findClientField", first["app/src/main/java/com/lenerd/spotifyplus/module/scripting/SpotifyServices.java"])
            self.assertIn("Skipping duplicate script", first["app/src/main/assets/nodejs-src/loader/script-loader.ts"])
            self.assertIn("Replacing older duplicate script", first["app/src/main/assets/nodejs-src/loader/script-loader.ts"])
            self.assertIn("compareScriptVersions", first["app/src/main/assets/nodejs-src/loader/script-loader.ts"])
            self.assertIn("BackupPage", first["scripts/settings/src/app.tsx"])

    def test_bundled_playnext_and_local_suite_assets_if_prepared(self):
        ext_root = ROOT / "app/api2-assets/api2-extensions"
        if not ext_root.exists():
            self.skipTest("api2-assets not prepared yet")
        pn = ext_root / "play-next"
        pn_manifest = json.loads((pn / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(pn_manifest["id"], "com.lenerd.playnext")
        self.assertEqual(pn_manifest["api"], 2)
        self.assertTrue((pn / pn_manifest["main"]).is_file())
        self.assertTrue((pn / "assets/list-start.svg").is_file())

        expected_suite = {
            "com.wamako.listeningstats",
            "com.wamako.sortplay",
            "com.wamako.genres",
            "com.wamako.playlistplus",
            "com.wamako.bookmarksplus",
            "com.wamako.shuffleplus",
        }
        suite_dir = ext_root / "local-suite"
        found = {p.name for p in suite_dir.iterdir() if p.is_dir()}
        self.assertEqual(found, expected_suite)
        for ext_id in expected_suite:
            m = json.loads((suite_dir / ext_id / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(m["id"], ext_id)
            self.assertEqual(m["api"], 2)
            self.assertTrue((suite_dir / ext_id / m["main"]).is_file())
