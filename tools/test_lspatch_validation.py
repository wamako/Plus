"""Check failure behavior of the device harness and bounded nested-APK reader."""
import hashlib
import pathlib
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from prepare_lspatch_smoke import download
from run_lspatch_smoke import Device, log_status, provision
from verify_lspatched_package import verify_origin


class LogTests(unittest.TestCase):
    def test_live_process_or_one_marker_is_not_a_host_pass(self):
        flags, errors = log_status("[SpotifyPlus] Loading SpotifyPlus v0.10.0\n")
        self.assertTrue(flags["module_entered"])
        self.assertFalse(flags["node_host_ready"])
        self.assertFalse(flags["shuffle_extension_loaded"])
        self.assertEqual(errors, [])

    def test_ready_markers_do_not_hide_native_startup_failure(self):
        flags, errors = log_status("Bootstrap loader from embedment\n"
                                   "[SpotifyPlus] Loading SpotifyPlus v0.10.0\nHost ready\n"
                                   "Loaded script com.wamako.shuffleplus from /test\n"
                                   "UnsatisfiedLinkError: Attempt to load writable file")
        self.assertTrue(all(flags.values()))
        self.assertEqual(errors, ["native_link_error", "writable_code_rejected"])

    def test_every_reported_crash_category_is_checked(self):
        from run_lspatch_smoke import ERRORS
        for name, text in ERRORS.items():
            self.assertIn(name, log_status(text)[1])


class DeviceGuards(unittest.TestCase):
    def test_apk_backed_framework_mapping_does_not_require_a_member_filename(self):
        from unittest.mock import Mock
        from run_lspatch_smoke import inspect_native_code
        device = Mock()
        device.shell.side_effect = ["/data/app/example/base.apk\nlibnode.so\nlibnative-lib.so\nspotifyplus_bridge.node",
                                    "444", "444", "444", "444"]
        result = inspect_native_code(device, "123")
        self.assertTrue(all(result["mapped"].values()))
        self.assertTrue(result["extracted_native_code_read_only"])
        self.assertEqual(device.root.call_args_list, [unittest.mock.call(True), unittest.mock.call(False)])

    def test_writable_code_fails_and_adb_is_unrooted_after_inspection(self):
        from unittest.mock import Mock
        from run_lspatch_smoke import inspect_native_code
        device = Mock()
        device.shell.side_effect = ["libnode.so\nlibnative-lib.so\nspotifyplus_bridge.node",
                                    "444", "644", "444", "444"]
        with self.assertRaisesRegex(RuntimeError, "writable"):
            inspect_native_code(device, "123")
        self.assertEqual(device.root.call_args_list, [unittest.mock.call(True), unittest.mock.call(False)])

    def test_physical_or_multiple_devices_are_refused_before_mutation(self):
        for listing in ("List of devices attached\nphone123\tdevice\n",
                        "List of devices attached\nemulator-5554\tdevice\nemulator-5556\tdevice\n"):
            with patch("run_lspatch_smoke.subprocess.run") as run:
                run.return_value.stdout = listing
                with self.assertRaisesRegex(RuntimeError, "exactly one"):
                    Device()
                self.assertEqual(run.call_count, 1)

    def test_api_abi_emulator_and_fresh_install_are_required(self):
        from unittest.mock import Mock
        for replies, message in ((["0"], "emulators"), (["1", "36"], "API 37"),
                                  (["1", "37", "x86_64"], "native arm64"),
                                  (["1", "37", "arm64-v8a", "package:com.spotify.music"], "already installed")):
            device = Mock()
            device.shell.side_effect = replies
            with self.assertRaisesRegex(RuntimeError, message):
                provision(device, pathlib.Path("unused.apk"), pathlib.Path("unused"))
            device.adb.assert_not_called()


class InputTests(unittest.TestCase):
    def test_download_errors_do_not_expose_a_signed_input_url(self):
        secret_url = "https://example.invalid/input?private=do-not-log"
        with tempfile.TemporaryDirectory() as temp, patch("urllib.request.urlopen", side_effect=OSError(secret_url)):
            with self.assertRaises(RuntimeError) as result:
                download(secret_url, pathlib.Path(temp) / "input.apk", "0" * 64)
            self.assertNotIn(secret_url, str(result.exception))
            self.assertTrue(result.exception.__suppress_context__)

    def test_changed_original_bytes_cannot_pass_the_nested_reader(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            data = b"original APK fixture"
            original = root / "original.apk"
            original.write_bytes(data)
            patched = root / "patched.apk"
            with zipfile.ZipFile(patched, "w") as output:
                output.writestr("assets/lspatch/origin.apk", data)
            with zipfile.ZipFile(patched) as output:
                verify_origin(output, patched, original, hashlib.sha256(data).hexdigest())
                with self.assertRaisesRegex(AssertionError, "changed"):
                    verify_origin(output, patched, original, "0" * 64)
                offset = output.getinfo("assets/lspatch/origin.apk").header_offset
            # Corrupt data while preserving the central/local headers.
            content = bytearray(patched.read_bytes())
            import struct
            header = struct.unpack_from("<4s5H3I2H", content, offset)
            content[offset + 30 + header[9] + header[10]] ^= 1
            patched.write_bytes(content)
            with zipfile.ZipFile(patched) as output:
                with self.assertRaisesRegex(AssertionError, "CRC"):
                    verify_origin(output, patched, original, hashlib.sha256(data).hexdigest())

    def test_compressed_enclosing_apk_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            original, output_path = pathlib.Path(temp) / "original", pathlib.Path(temp) / "out.zip"
            original.write_bytes(b"fixture")
            with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as output:
                output.writestr("assets/lspatch/origin.apk", original.read_bytes())
            with zipfile.ZipFile(output_path) as output:
                with self.assertRaises(AssertionError):
                    verify_origin(output, output_path, original, "0" * 64)


if __name__ == "__main__":
    unittest.main()
