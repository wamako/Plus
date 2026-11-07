"""Storage success must come from the correct launched app process and phase."""
import contextlib
import io
import itertools
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

from run_lspatch_smoke import STORAGE_MARKERS, launch, main, provision, storage_status

HOST_READY = ("Bootstrap loader from embedment\n[SpotifyPlus] Loading SpotifyPlus v\n"
              "Native PlayCommand binding installed\nHost ready\nLoaded script com.wamako.shuffleplus from /private\n")


class StorageProbeTests(unittest.TestCase):
    def test_marker_requires_the_expected_phase_and_a_complete_fixed_token(self):
        for phase, marker in STORAGE_MARKERS.items():
            self.assertTrue(storage_status("[CI] " + marker + "\n", phase)[0])
            self.assertFalse(storage_status(marker + "_unverified", phase)[0])
            self.assertFalse(storage_status(HOST_READY, phase)[0])
            other = "reload" if phase == "write" else "write"
            with self.assertRaisesRegex(RuntimeError, "wrong launch phase"):
                storage_status(marker, other)
        with self.assertRaisesRegex(RuntimeError, "wrong launch phase"):
            storage_status("\n".join(STORAGE_MARKERS.values()), "reload")

    def run_launch(self, app_log, global_log=None):
        device = Mock()
        device.pid.return_value = "42"
        device.shell.return_value = ""
        device.adb.side_effect = lambda *args, **kwargs: (
            global_log if global_log is not None and args == ("logcat", "-d") else app_log)
        return device

    def test_process_scoped_storage_phase_is_required_before_the_stability_window(self):
        for phase in STORAGE_MARKERS:
            device = self.run_launch(HOST_READY + STORAGE_MARKERS[phase])
            clock = itertools.count(0, 2)
            with patch("run_lspatch_smoke.time.monotonic", side_effect=lambda: next(clock)), \
                    patch("run_lspatch_smoke.time.sleep"):
                result, pid = launch(device, 60, storage_phase=phase)
            self.assertEqual(pid, "42")
            self.assertEqual(result["storage_probe"], {"phase": phase, "passed": True})
            self.assertEqual(result["stable_after_ready_seconds"], 15)

    def test_global_storage_marker_or_lost_second_launch_state_cannot_pass(self):
        for app_log, global_log, message in (
            (HOST_READY, HOST_READY + STORAGE_MARKERS["reload"], "Timed out"),
            (HOST_READY + STORAGE_MARKERS["write"], None, "wrong launch phase"),
        ):
            device = self.run_launch(app_log, global_log)
            clock = itertools.count(0, 2)
            details = {}
            with patch("run_lspatch_smoke.time.monotonic", side_effect=lambda: next(clock)), \
                    patch("run_lspatch_smoke.time.sleep"):
                with self.assertRaisesRegex(RuntimeError, message):
                    launch(device, 25, details, storage_phase="reload")
            self.assertNotIn("/private", json.dumps(details))
            self.assertFalse(details.get("storage_probe_markers", {}).get("reload", False))

    def test_invalid_probe_is_refused_before_install_or_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            extension = root / "shuffle"
            probe = root / "probe"
            for folder, identity in ((extension, "com.wamako.shuffleplus"), (probe, "wrong.id")):
                folder.mkdir()
                (folder / "manifest.json").write_text(json.dumps({"id": identity, "api": 2, "main": "index.js"}))
                (folder / "index.js").write_text("fixture")
            device = Mock()
            device.shell.return_value = ""
            with patch("run_lspatch_smoke.check_environment"):
                with self.assertRaisesRegex(RuntimeError, "API-2 smoke-test"):
                    provision(device, root / "app.apk", extension, storage_probe=probe)
            device.adb.assert_not_called()
            device.root.assert_not_called()

    def test_failed_reload_or_reused_process_never_reports_verified_persistence(self):
        for second in (RuntimeError("Storage probe reported the wrong launch phase"),
                       ({"storage_probe": {"phase": "reload", "passed": True}}, "42")):
            with self.subTest(second=type(second).__name__), tempfile.TemporaryDirectory() as directory:
                report = pathlib.Path(directory) / "startup.json"
                device = Mock()
                device.pid.return_value = "42"
                first = ({"storage_probe": {"phase": "write", "passed": True}}, "42")
                with patch("sys.argv", ["smoke", "--apk", "app.apk", "--extension", "shuffle",
                                        "--storage-probe", "probe", "--report", str(report)]), \
                        patch("run_lspatch_smoke.Device", return_value=device), \
                        patch("run_lspatch_smoke.check_environment", return_value={}), \
                        patch("run_lspatch_smoke.guest_capacity", return_value={}), \
                        patch("run_lspatch_smoke.provision"), patch("run_lspatch_smoke.settle_guest", return_value={}), \
                        patch("run_lspatch_smoke.inspect_native_code", return_value={}), \
                        patch("run_lspatch_smoke.launch", side_effect=[first, second]), \
                        contextlib.redirect_stdout(io.StringIO()):
                    with self.assertRaises(SystemExit):
                        main()
                result = json.loads(report.read_text())
                self.assertFalse(result["passed"])
                self.assertFalse(result["storage_persistence_verified"])
                self.assertTrue(result["storage_persistence_test_requested"])
                self.assertEqual(len(result["launches"]), 1)


if __name__ == "__main__":
    unittest.main()
