"""Check failure behavior of the device harness and bounded nested-APK reader."""
import hashlib
import os
import pathlib
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch, Mock

from prepare_lspatch_smoke import download, describe_input, apkmirror_file_link, HTTPSRedirects
from google_drive_input import download_url as drive_download_url, confirmation_url as drive_confirmation_url
from run_lspatch_smoke import Device, log_status, provision, check_environment, NATIVE, NATIVE_X86, TRANSLATED, TRANSLATED35, safe_startup_details, collect_startup_details, launch
from verify_lspatched_package import verify_origin, validate_module_identity
from check_android37_acceleration import assess
from report_android37_scope import classify
from check_android37_image import inspect as inspect_image, PACKAGE as IMAGE_PACKAGE


class ImageInventoryTests(unittest.TestCase):
    def test_android15_image_is_explicit_and_cannot_satisfy_android17_inventory(self):
        text = self.fixture(path=IMAGE_PACKAGE.replace("37.0", "35").replace("arm64-v8a", "x86_64"), abi="x86_64").replace('<api-level>37.0</api-level>', '<api-level>35</api-level>')
        self.assertEqual(inspect_image(text, "x86_64", "35")["api_level"], "35")
        with self.assertRaises(ValueError):
            inspect_image(text, "x86_64")

    def test_linux_x86_image_requires_explicit_selection(self):
        text = self.fixture(path=IMAGE_PACKAGE.replace("arm64-v8a", "x86_64"), abi="x86_64")
        report = inspect_image(text, "x86_64")
        self.assertEqual(report["abi"], "x86_64")
        self.assertFalse(report["runtime_test_executed"])
        with self.assertRaises(ValueError):
            inspect_image(text)

    def fixture(self, path=IMAGE_PACKAGE, abi="arm64-v8a", channel="channel-0"):
        return f'<repo><remotePackage path="{path}"><type-details><api-level>37.0</api-level><abi>{abi}</abi></type-details><channelRef ref="{channel}"/></remotePackage></repo>'

    def test_exact_stable_package_is_inventory_evidence_only(self):
        report = inspect_image(self.fixture())
        self.assertTrue(report["listed"])
        self.assertFalse(report["runtime_test_executed"])

    def test_no_minor_version_or_architecture_substitution(self):
        for text in (self.fixture(path=IMAGE_PACKAGE.replace("37.0", "37.2")), self.fixture(abi="x86_64")):
            with self.assertRaises(ValueError):
                inspect_image(text)

    def test_preview_channel_is_refused(self):
        with self.assertRaises(ValueError):
            inspect_image(self.fixture(channel="channel-3"))


class BootScopeTests(unittest.TestCase):
    def test_native_x86_profile_cannot_become_an_arm_translation_or_phone_pass(self):
        details = {"api": 37, "abi": "x86_64", "app_abi": "x86_64", "emulator": True,
                   "profile": NATIVE_X86, "arm_translation": False, "arm_compat_advertised": True}
        env = {"passed": True, "test_kind": "android37_environment_only", "environment": details}
        report = classify("kvm-native-x86_64", "success", env, profile=NATIVE_X86)
        self.assertTrue(report["native_x86_test"])
        self.assertFalse(report["native_arm64_test"])
        self.assertFalse(report["arm64_translation_test"])
        self.assertFalse(classify("hardware", "success", env, profile=NATIVE)["passed"])
        self.assertFalse(classify("hardware", "success", env, profile=TRANSLATED)["passed"])

    def test_android15_guest_is_never_reported_as_an_android17_pass(self):
        details = {"api": 35, "abi": "x86_64", "app_abi": "arm64-v8a", "emulator": True,
                   "profile": TRANSLATED35, "arm_translation": True,
                   "native_bridge": "libndk_translation.so", "arm64_instruction_set": "x86_64"}
        env = {"passed": True, "test_kind": "android35_environment_only", "environment": details}
        report = classify("kvm-arm64-translation", "success", env, profile=TRANSLATED35)
        self.assertTrue(report["passed"])
        self.assertEqual(report["guest_api"], 35)
        self.assertFalse(classify("kvm-arm64-translation", "success", env, profile=TRANSLATED)["passed"])

    def test_single_shell_entry_runs_startup_only_after_successful_guest_check(self):
        script = pathlib.Path(__file__).with_name("run_android37_validation.sh")
        for requested, fail_guest, expected in (("false", False, 1), ("true", False, 2), ("true", True, 1)):
            with self.subTest(requested=requested, fail_guest=fail_guest), tempfile.TemporaryDirectory() as temp:
                root = pathlib.Path(temp)
                fake = root / "python3"
                fake.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n'
                                'case "$*" in *--check-environment*) test "$FAIL_GUEST" != true || exit 17 ;; esac\n')
                fake.chmod(0o755)
                log = root / "calls"
                env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                       "CALL_LOG": str(log), "FAIL_GUEST": str(fail_guest).lower(),
                       "RUNNER_TEMP": temp, "DEVICE_PROFILE": TRANSLATED,
                       "SPOTIFYPLUS_RUN_PATCHED_HOST": requested}
                result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 17 if fail_guest else 0)
                lines = log.read_text().splitlines()
                self.assertEqual(len(lines), expected)
                self.assertIn("--check-environment", lines[0])
                if expected == 2:
                    self.assertIn("--apk", lines[1])
                    self.assertIn("--extension", lines[1])

    def test_linux_guest_requires_all_translation_evidence_and_never_claims_native_arm(self):
        details = {"api": 37, "abi": "x86_64", "app_abi": "arm64-v8a", "emulator": True,
                   "profile": TRANSLATED, "arm_translation": True,
                   "native_bridge": "libndk_translation.so", "arm64_instruction_set": "x86_64"}
        env = {"passed": True, "test_kind": "android37_environment_only", "environment": details}
        report = classify("kvm-arm64-translation", "success", env, profile=TRANSLATED)
        self.assertEqual(report["result"], "booted")
        self.assertTrue(report["arm64_translation_test"])
        self.assertFalse(report["native_arm64_test"])
        self.assertNotIn("patched_host_test_executed", report)
        self.assertFalse(classify("hardware", "success", env, profile=NATIVE)["passed"])
        for key in details:
            changed = {**env, "environment": {k: v for k, v in details.items() if k != key}}
            with self.subTest(missing=key):
                self.assertFalse(classify("kvm-arm64-translation", "success", changed, profile=TRANSLATED)["passed"])

    def test_capabilities_only_never_claims_a_guest_boot(self):
        report = classify("software", "skipped", {}, probe_only=True)
        self.assertEqual(report["result"], "capabilities_only")
        self.assertIsNone(report["passed"])
        self.assertFalse(report["emulator_boot_attempted"])
    def test_optional_software_failure_is_never_a_runtime_pass(self):
        report = classify("software", "failure", {})
        self.assertEqual(report["result"], "software_boot_failed")
        self.assertFalse(report["passed"])
        self.assertFalse(report["guest_api_abi_verified"])

    def test_action_success_without_guest_evidence_is_not_a_pass(self):
        report = classify("software", "success", {})
        self.assertEqual(report["result"], "setup_failed")
        self.assertFalse(report["passed"])

    def test_guest_proof_does_not_claim_spotify_started(self):
        env = {"passed": True, "test_kind": "android37_arm64_environment_only",
               "environment": {"api": 37, "abi": "arm64-v8a"}}
        report = classify("software", "success", env)
        self.assertEqual(report["result"], "booted")
        self.assertTrue(report["passed"])
        self.assertNotIn("patched_host_test_executed", report)


class AccelerationTests(unittest.TestCase):
    def test_inconclusive_backend_probe_does_not_claim_tcg_is_missing(self):
        report = assess(0, "github-hosted", try_software=True, tcg_available=None)
        self.assertEqual(report["boot_mode"], "unavailable")
        self.assertIsNone(report["software_backend_available"])
    def test_explicit_hosted_software_trial_does_not_claim_acceleration_or_boot(self):
        report = assess(0, "github-hosted", try_software=True, tcg_available=True)
        self.assertEqual(report["boot_mode"], "software")
        self.assertEqual(report["result"], "software_trial_requested")
        self.assertFalse(report["accelerator_usable"])
        self.assertFalse(report["emulator_boot_executed"])
        self.assertFalse(report["patched_host_test_executed"])
        self.assertIsNone(report["passed"])

    def test_missing_tcg_backend_prevents_a_known_bad_software_launch(self):
        report = assess(0, "github-hosted", try_software=True, tcg_available=False)
        self.assertEqual(report["boot_mode"], "unavailable")
        self.assertFalse(report["software_backend_available"])

    def test_software_trial_does_not_mask_a_failed_physical_runner(self):
        self.assertEqual(assess(1, "self-hosted", try_software=True)["boot_mode"], "unavailable")

    def test_hosted_arm_mac_never_claims_a_boot_from_a_framework_probe(self):
        report = assess(0, "github-hosted")
        self.assertTrue(report["accelerator_probe_success"])
        self.assertFalse(report["accelerator_usable"])
        self.assertEqual(report["result"], "unsupported_runner")
        self.assertIsNone(report["passed"])
        self.assertFalse(report["emulator_boot_executed"])

    def test_capable_self_hosted_probe_is_still_not_a_runtime_pass(self):
        report = assess(0, "self-hosted")
        self.assertTrue(report["accelerator_usable"])
        self.assertIsNone(report["passed"])
        self.assertFalse(report["patched_host_test_executed"])

    def test_failed_self_hosted_probe_is_unsupported(self):
        self.assertFalse(assess(1, "self-hosted")["accelerator_usable"])


class LogTests(unittest.TestCase):
    def test_diagnostics_never_return_raw_logs_urls_paths_or_messages(self):
        raw = ('UnsatisfiedLinkError: /data/private-name/file.so is for EM_AARCH64 instead of EM_X86_64 '
               'https://private.invalid/?access_token=private-value\nHost ready')
        details = safe_startup_details(raw)
        self.assertTrue(details["native_link_reasons"]["wrong_elf_architecture"])
        self.assertIn("UnsatisfiedLinkError", details["exception_types"])
        self.assertTrue(details["process_markers"]["node_host_ready"])
        for private in ("private.invalid", "private-value", "/data/", "EM_AARCH64"):
            self.assertNotIn(private, str(details))

    def test_crash_pid_is_correlated_without_publishing_its_log(self):
        device = Mock()
        device.adb.side_effect = ["Process: com.spotify.music, PID: 42\nprivate-global-data",
                                  "ClassNotFoundException: private-message\nFATAL EXCEPTION"]
        details = {}
        collect_startup_details(device, None, details)
        self.assertTrue(details["spotify_java_crash_reported"])
        self.assertTrue(details["process_observed"])
        self.assertEqual(details["exception_types"], ["ClassNotFoundException"])
        self.assertNotIn("private", str(details))
        device.adb.assert_called_with("logcat", "-d", "--pid=42", timeout=15)

    def test_global_markers_cannot_pass_a_launch_without_a_spotify_process(self):
        device = Mock()
        device.pid.return_value = None
        device.adb.return_value = ("Bootstrap loader from embedment\n[SpotifyPlus] Loading SpotifyPlus v\n"
                                   "Host ready\nLoaded script com.wamako.shuffleplus from /private")
        details = {}
        with patch("run_lspatch_smoke.time.monotonic", side_effect=[0, 0, 31]):
            with self.assertRaisesRegex(RuntimeError, "running process"):
                launch(device, 360, details)
        self.assertTrue(all(details["launch_log_markers"].values()))
        self.assertFalse(any(details["process_markers"].values()))
        self.assertFalse(details["process_observed"])
        self.assertNotIn("/private", str(details))

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
    def test_native_x86_environment_does_not_require_an_active_arm_translator(self):
        device = self.translation_device(**{"ro.dalvik.vm.native.bridge": "0"})
        environment = check_environment(device, NATIVE_X86)
        self.assertEqual(environment["app_abi"], "x86_64")
        self.assertFalse(environment["arm_translation"])

    def test_android15_profile_requires_explicit_selection(self):
        device = self.translation_device(**{"ro.build.version.sdk": "35"})
        self.assertEqual(check_environment(device, TRANSLATED35)["api"], 35)
        with self.assertRaisesRegex(RuntimeError, "API 37"):
            check_environment(device, TRANSLATED)

    def test_original_control_refuses_wrong_input_or_device_before_uninstall(self):
        from run_lspatch_smoke import original_control
        device = Mock()
        with tempfile.TemporaryDirectory() as temp:
            original = pathlib.Path(temp) / "wrong.apk"
            original.write_bytes(b"not the original")
            with patch("run_lspatch_smoke.check_environment"):
                with self.assertRaisesRegex(RuntimeError, "pinned unpatched"):
                    original_control(device, original, TRANSLATED)
            device.adb.assert_not_called()
            with patch("run_lspatch_smoke.check_environment", side_effect=RuntimeError("physical device")):
                with self.assertRaisesRegex(RuntimeError, "physical"):
                    original_control(device, original, TRANSLATED)
            device.adb.assert_not_called()

    def test_original_control_requires_stable_android_process_and_resumed_activity(self):
        from run_lspatch_smoke import original_control
        device = Mock()
        device.pid.return_value = "42"
        device.shell.side_effect = ["primaryCpuAbi=arm64-v8a", "Status: ok", "topResumedActivity=ActivityRecord{com.spotify.music/.MainActivity}"]
        with patch("run_lspatch_smoke.check_environment"), patch("prepare_lspatch_smoke.checksum", return_value=__import__("prepare_lspatch_smoke").ORIGINAL_SHA), \
                patch("run_lspatch_smoke.time.monotonic", side_effect=[0, 0, 0, 0, 16, 16]), patch("run_lspatch_smoke.time.sleep"):
            result = original_control(device, pathlib.Path("original.apk"), TRANSLATED)
        self.assertTrue(result["passed"])
        self.assertEqual(result["test_kind"], "unpatched_original_control")
        self.assertFalse(result["playback_test_executed"])

    def activity_device(self, records, alive):
        device = object.__new__(Device)
        device.shell = Mock(return_value=records)
        device.adb = Mock(side_effect=alive)
        return device

    def test_process_identity_uses_android_main_record_and_ignores_helpers(self):
        records = ('ProcessRecord{a1 42:com.spotify.music/u0a113}\n'
                   'ProcessRecord{a2 43:com.spotify.music:helper/u0a113}\n'
                   'ProcessRecord{a3 44:com.spotify.music.other/u0a114}\n'
                   'ProcessRecord{a1 42:com.spotify.music/u0a113}\n')
        device = self.activity_device(records, ["alive"])
        self.assertEqual(device.pid(), "42")
        device.shell.assert_called_once_with("dumpsys", "activity", "processes", "com.spotify.music", timeout=15)
        self.assertEqual(device.last_process_lookup["registered_main_processes"], 1)

    def test_stale_and_ambiguous_process_records_do_not_select_an_arbitrary_pid(self):
        records = 'ProcessRecord{a1 42:com.spotify.music/u0a113}\nProcessRecord{a2 43:com.spotify.music/u0a113}'
        self.assertEqual(self.activity_device(records, ["", "alive"]).pid(), "43")
        self.assertIsNone(self.activity_device(records, ["alive", "alive"]).pid())
        self.assertIsNone(self.activity_device(records, ["", ""]).pid())

    def test_invalid_or_other_user_process_ids_never_become_shell_commands(self):
        records = ('ProcessRecord{a1 0:com.spotify.music/u0a113}\n'
                   'ProcessRecord{a2 42:com.spotify.music/u10a113}\n'
                   'ProcessRecord{a3 42;private:com.spotify.music/u0a113}\n')
        device = self.activity_device(records, [])
        self.assertIsNone(device.pid())
        device.adb.assert_not_called()

    def translation_device(self, **overrides):
        props = {"ro.kernel.qemu": "1", "ro.build.version.sdk": "37",
                 "ro.product.cpu.abi": "x86_64", "ro.product.cpu.abilist64": "x86_64,arm64-v8a",
                 "ro.dalvik.vm.native.bridge": "libndk_translation.so", "ro.dalvik.vm.isa.arm64": "x86_64"}
        props.update(overrides)
        device = Mock()
        device.shell.side_effect = lambda *args, **kwargs: props[args[1]] if args[0] == "getprop" else ""
        return device

    def test_translation_is_opt_in_and_missing_native_bridge_prevents_install(self):
        device = self.translation_device()
        with self.assertRaisesRegex(RuntimeError, "native arm64"):
            check_environment(device)
        for prop, value in (("ro.product.cpu.abilist64", "x86_64"),
                            ("ro.dalvik.vm.native.bridge", "0"), ("ro.dalvik.vm.isa.arm64", "")):
            device = self.translation_device(**{prop: value})
            with self.subTest(prop=prop), self.assertRaisesRegex(RuntimeError, "translation"):
                provision(device, pathlib.Path("unused.apk"), pathlib.Path("unused"), TRANSLATED)
            device.adb.assert_not_called()
        self.assertTrue(check_environment(self.translation_device(), TRANSLATED)["arm_translation"])

    def test_install_forces_arm64_and_refuses_wrong_package_abi_before_fixture_writes(self):
        device = self.translation_device()
        props_only = device.shell.side_effect
        device.shell.side_effect = lambda *args, **kwargs: ("primaryCpuAbi=x86_64" if args[0] == "dumpsys" else props_only(*args, **kwargs))
        with tempfile.TemporaryDirectory() as temp:
            extension = pathlib.Path(temp)
            (extension / "manifest.json").write_text('{"id":"com.wamako.shuffleplus","api":2,"main":"index.js"}')
            (extension / "index.js").write_text("fixture")
            with self.assertRaisesRegex(RuntimeError, "required ARM64 ABI"):
                provision(device, pathlib.Path("input.apk"), extension, TRANSLATED)
        device.adb.assert_called_once_with("install", "--abi", "arm64-v8a", pathlib.Path("input.apk"), timeout=180)
        device.root.assert_not_called()

    def test_translated_startup_requires_native_bridge_mapping(self):
        from run_lspatch_smoke import inspect_native_code
        device = Mock()
        device.shell.return_value = "libnode.so\nlibnative-lib.so\nspotifyplus_bridge.node"
        with self.assertRaisesRegex(RuntimeError, "translation library"):
            inspect_native_code(device, "123", TRANSLATED)
        self.assertEqual(device.root.call_args_list, [unittest.mock.call(True), unittest.mock.call(False)])

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
    def test_emulator_module_version_requires_explicit_abi(self):
        phone = {"package": "com.lenerd46.spotifyplus", "version": "0.10.0-api2.9.1.94.13"}
        emulator = {**phone, "version": phone["version"] + "-emulator-x86_64"}
        validate_module_identity(phone, "arm64-v8a")
        validate_module_identity(emulator, "x86_64")
        with self.assertRaises(AssertionError):
            validate_module_identity(emulator, "arm64-v8a")
        with self.assertRaises(AssertionError):
            validate_module_identity(phone, "x86_64")

    def test_emulator_node_keeps_arm_bytes_and_checks_archive_and_headers_before_writing(self):
        import prepare_emulator_node as node
        import struct
        binary = bytearray(80)
        binary[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", binary, 18, 62)
        binary += b"v18.20.4"
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            archive = root / "vendor.zip"
            for header in node.HEADERS:
                path = root / "app/libnode/include/node" / header
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"trusted header")
            with zipfile.ZipFile(archive, "w") as package:
                for header in node.HEADERS:
                    package.writestr("include/node/" + header, b"trusted header")
                package.writestr("bin/x86_64/libnode.so", binary)
            arm = root / "app/libnode/bin/arm64-v8a/libnode.so"
            arm.parent.mkdir(parents=True, exist_ok=True)
            arm.write_bytes(b"unchanged phone runtime")
            with patch.object(node, "ARCHIVE_SHA", hashlib.sha256(archive.read_bytes()).hexdigest()), \
                    patch.object(node, "NODE_SHA", hashlib.sha256(binary).hexdigest()):
                node.install(archive, root)
                self.assertEqual(arm.read_bytes(), b"unchanged phone runtime")
                target = root / "app/libnode/bin/x86_64/libnode.so"
                target.unlink()
                (root / "app/libnode/include/node/node_api.h").write_bytes(b"wrong header")
                with self.assertRaisesRegex(ValueError, "headers"):
                    node.install(archive, root)
                self.assertFalse(target.exists())
                archive.write_bytes(archive.read_bytes() + b"corrupt")
                with self.assertRaisesRegex(ValueError, "checksum"):
                    node.install(archive, root)
                self.assertFalse(target.exists())

    def drive_form(self, *, file_id="fixtureFile123", action="https://drive.usercontent.google.com/download", method="get", extra=""):
        return ('<html><form id="download-form" action="' + action + '" method="' + method + '">'
                '<input type="hidden" name="id" value="' + file_id + '">'
                '<input type="hidden" name="export" value="download">'
                '<input type="hidden" name="confirm" value="t">'
                '<input type="hidden" name="uuid" value="fixture-session-uuid">' + extra + '</form></html>')

    def test_drive_sharing_link_becomes_same_file_download_without_viewer(self):
        self.assertEqual(drive_download_url("https://drive.google.com/file/d/fixtureFile123/view?usp=sharing"),
                         "https://drive.usercontent.google.com/uc?id=fixtureFile123&export=download")
        self.assertIn("resourcekey=fixture-key", drive_download_url("https://drive.google.com/file/d/fixtureFile123/view?resourcekey=fixture-key"))
        self.assertEqual(drive_download_url("https://example.invalid/file.apk"), "https://example.invalid/file.apk")

    def test_drive_confirmation_rejects_external_forms_file_substitution_and_duplicates(self):
        page = "https://drive.usercontent.google.com/uc?id=fixtureFile123&export=download"
        for html in (self.drive_form(action="https://advert.invalid/download"),
                     self.drive_form(file_id="differentFile456"), self.drive_form(method="post"),
                     self.drive_form(extra='<input type="hidden" name="id" value="fixtureFile123">'),
                     self.drive_form() + self.drive_form(),
                     self.drive_form(extra='<input type="hidden" name="password" value="private">')):
            with self.subTest(html=html), self.assertRaises(ValueError):
                drive_confirmation_url(page, html, "fixtureFile123")
        self.assertIsNone(drive_confirmation_url("https://advert.invalid/", self.drive_form(), "fixtureFile123"))
        self.assertIsNone(drive_confirmation_url(page, "<html>Sign in to continue</html>", "fixtureFile123"))

    def test_drive_download_confirmation_preserves_hash_guard_and_is_bounded(self):
        import io
        payload = b"fixture original APK"
        expected = hashlib.sha256(payload).hexdigest()
        page_url = "https://drive.usercontent.google.com/uc?id=fixtureFile123&export=download"
        html = self.drive_form().encode()
        for final in (payload, b"wrong APK", html):
            with self.subTest(final=final), tempfile.TemporaryDirectory() as temp:
                first, second = io.BytesIO(html), io.BytesIO(final)
                first.url, second.url = page_url, "https://drive.usercontent.google.com/download"
                opener = Mock()
                opener.open.side_effect = [first, second]
                target = pathlib.Path(temp) / "input.apk"
                with patch("prepare_lspatch_smoke.urllib.request.build_opener", return_value=opener), \
                        patch("prepare_lspatch_smoke.ORIGINAL_SHA", expected):
                    if final == payload:
                        download("https://drive.google.com/file/d/fixtureFile123/view", target, expected)
                        self.assertEqual(target.read_bytes(), payload)
                    else:
                        with self.assertRaisesRegex(ValueError, "SHA-256"):
                            download("https://drive.google.com/file/d/fixtureFile123/view", target, expected)
                        self.assertFalse(target.exists())
                self.assertEqual(opener.open.call_count, 2)

    def test_http_failure_reports_status_without_secret_or_page_content(self):
        import urllib.error
        import json
        url = "https://example.invalid/?private=do-not-log"
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError(url, 403, "private response", {}, None)
        with tempfile.TemporaryDirectory() as temp, patch("urllib.request.build_opener", return_value=opener):
            report = pathlib.Path(temp) / "input.json"
            with self.assertRaisesRegex(RuntimeError, "HTTP 403") as error:
                download(url, pathlib.Path(temp) / "input.apk", "0" * 64, report)
            self.assertEqual(json.loads(report.read_text())["http_status"], 403)
            self.assertNotIn("private", report.read_text() + str(error.exception))

    def test_provider_link_decodes_relative_html_anchor(self):
        url = apkmirror_file_link("https://www.apkmirror.com/apk/test/download/",
            '<html><a href="https://advert.invalid/">ad</a><a id="download-link" '
            'href="/wp-content/themes/APKMirror/download.php?id=1&amp;key=fixture&amp;forcebaseapk=true">file</a></html>')
        self.assertEqual(url, "https://www.apkmirror.com/wp-content/themes/APKMirror/download.php?id=1&key=fixture&forcebaseapk=true")

    def test_provider_link_refuses_other_destinations_and_ambiguous_anchors(self):
        base = "https://www.apkmirror.com/apk/test/"
        for href in ("https://advert.invalid/file", "http://www.apkmirror.com/file",
                     "/advertisement", "https://user:pass@www.apkmirror.com/wp-content/themes/APKMirror/download.php",
                     "https://www.apkmirror.com:444/wp-content/themes/APKMirror/download.php"):
            with self.subTest(href=href), self.assertRaises(ValueError):
                apkmirror_file_link(base, '<a id="download-link" href="' + href + '">file</a>')
        with self.assertRaises(ValueError):
            apkmirror_file_link(base, '<a id="download-link" href="/file">one</a>' * 2)
        self.assertIsNone(apkmirror_file_link("https://other.invalid/", '<a id="download-link" href="/file">file</a>'))

    def test_http_downgrade_is_rejected_before_request(self):
        with self.assertRaises(ValueError):
            HTTPSRedirects().redirect_request(None, None, 302, "", {}, "http://example.invalid/file")

    def test_download_page_is_followed_once_and_final_checksum_required(self):
        import io
        payload = b"fixture APK bytes"
        page = b'<html><a id="download-link" href="/wp-content/themes/APKMirror/download.php?key=fixture">file</a></html>'
        page_url = "https://www.apkmirror.com/apk/test/download/"
        for final in (payload, b"wrong APK", page):
            with self.subTest(final=final), tempfile.TemporaryDirectory() as temp:
                first, second = io.BytesIO(page), io.BytesIO(final)
                first.url, second.url = page_url, "https://download.apkmirror.com/file.apk"
                opener = Mock()
                opener.open.side_effect = [first, second]
                target = pathlib.Path(temp) / "input.apk"
                expected = hashlib.sha256(payload).hexdigest()
                with patch("prepare_lspatch_smoke.urllib.request.build_opener", return_value=opener), \
                        patch("prepare_lspatch_smoke.ORIGINAL_SHA", expected):
                    if final == payload:
                        download(page_url, target, expected)
                        self.assertEqual(target.read_bytes(), payload)
                    else:
                        with self.assertRaisesRegex(ValueError, "SHA-256"):
                            download(page_url, target, expected)
                        self.assertFalse(target.exists())
                self.assertEqual(opener.open.call_count, 2)

    def test_unexpected_manifest_strings_cannot_leak_into_diagnostics(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "input"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("AndroidManifest.xml", "fixture")
            info = {"package": "com.spotify.music", "version": "https://private.invalid/secret",
                    "version_code": "147600575", "target_sdk": "37"}
            with patch("prepare_lspatch_smoke.manifest", return_value=info):
                report = describe_input(path)
            self.assertEqual(report["version"], "unrecognized")
            self.assertNotIn("private.invalid", str(report))

    def test_html_diagnostic_never_echoes_page_data(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "input"
            path.write_bytes(b'<!doctype html><html>https://private.invalid/?secret=do-not-log</html>')
            import json
            report = describe_input(path)
            self.assertEqual(report["kind"], "html_page_not_apk")
            self.assertNotIn("private.invalid", json.dumps(report))
            self.assertNotIn("do-not-log", json.dumps(report))

    def test_zip_without_manifest_is_not_a_spotify_apk(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "input"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("private-file-name", "private-data")
            report = describe_input(path)
            self.assertEqual(report["kind"], "zip_archive_not_apk")
            self.assertNotIn("private-file-name", str(report))

    def test_download_errors_do_not_expose_a_signed_input_url(self):
        secret_url = "https://example.invalid/input?private=do-not-log"
        opener = Mock()
        opener.open.side_effect = OSError(secret_url)
        with tempfile.TemporaryDirectory() as temp, patch("urllib.request.build_opener", return_value=opener):
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
