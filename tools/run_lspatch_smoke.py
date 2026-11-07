#!/usr/bin/env python3
"""Exercise the patched host and Shuffle+ loader on a disposable Android AVD.

This is a logged-out startup test, not a Spotify playback/account test. Root ADB
is used only to provision/inspect the disposable AVD; each app launch runs with
ADB unrooted and LSPatch in integrated mode. Refuses physical/populated devices.
No raw logcat, UI dumps, APKs, account data or credentials are written to reports.
"""
import argparse
import json
import os
import pathlib
import re
import shlex
import subprocess
import time

PACKAGE = "com.spotify.music"
EXTENSION = "com.wamako.shuffleplus"
MARKERS = {
    "integrated_loader_entered": "Bootstrap loader from embedment",
    "module_entered": "[SpotifyPlus] Loading SpotifyPlus v",
    "node_host_ready": "Host ready",
    "shuffle_extension_loaded": "Loaded script com.wamako.shuffleplus from ",
}
ERRORS = {
    "java_crash": "FATAL EXCEPTION",
    "native_crash": "Fatal signal ",
    "native_link_error": "UnsatisfiedLinkError",
    "writable_code_rejected": "Attempt to load writable file",
    "host_failed": "Native extension host failed",
    "node_failed": "Host crashed",
    "extension_failed": "Failed to load script at ",
    "plugin_failed": "Failed to load APK file ",
}
# LSPatch loads its SO directly from the APK. Linux maps can name only base.apk,
# not the ZIP member. Its real bootstrap + Xposed module entry are checked above.
# These three Plus runtime binaries are extracted files and have named mappings.
LIBRARIES = ("libnode.so", "libnative-lib.so", "spotifyplus_bridge.node")
NATIVE = "native-arm64"
TRANSLATED = "linux-x86_64-arm64-translation"
TRANSLATED35 = "linux-x86_64-arm64-translation-api35"
TRANSLATED_PROFILES = (TRANSLATED, TRANSLATED35)
NATIVE_X86 = "linux-x86_64-native"

def app_abi(profile):
    return "x86_64" if profile == NATIVE_X86 else "arm64-v8a"

def log_status(log):
    return ({name: marker in log for name, marker in MARKERS.items()},
            [name for name, marker in ERRORS.items() if marker in log])

def activity_manager_pids(text):
    # AOSP ProcessRecord.toShortString uses pid:processName/u0a<appId>.
    # Match only this app's main user-0 process, not helpers or historical PID 0.
    return sorted(set(re.findall(r"ProcessRecord\{[0-9a-fA-F]+\s+([1-9]\d*):com\.spotify\.music/u0a\d+\}", text)), key=int)

def resumed_spotify_activity(text):
    return isinstance(text, str) and any(PACKAGE in line and
        ("mResumedActivity" in line or "topResumedActivity" in line) for line in text.splitlines())

def safe_startup_details(app_log):
    """Fixed names/booleans only; never return log lines, paths or messages."""
    flags, errors = log_status(app_log)
    exception_types = ("UnsatisfiedLinkError", "SecurityException", "ClassNotFoundException",
                       "NoClassDefFoundError", "ExceptionInInitializerError", "VerifyError",
                       "IllegalStateException", "IOException", "NullPointerException")
    reasons = {"wrong_elf_architecture": "EM_AARCH64" in app_log and "EM_X86_64" in app_log,
               "library_not_found": "dlopen failed" in app_log and "not found" in app_log,
               "namespace_access_denied": "not accessible for the namespace" in app_log,
               "writable_code_rejected": "Attempt to load writable file" in app_log}
    return {"process_markers": flags, "process_error_categories": errors,
            "exception_types": [name for name in exception_types if re.search(r"\b" + name + r"\b", app_log)],
            "native_link_reasons": reasons,
            "exception_frame_groups": {name: bool(re.search(r"\bat " + pattern + r"[\w.$<>]*\(", app_log))
                for name, pattern in {
                    "module_entry": r"com\.lenerd46\.spotifyplus\.XposedLoader\.",
                    "api2_bootstrap": r"com\.lenerd46\.spotifyplus\.api2\.Api2Runtime\.",
                    "native_script_manager": r"com\.lenerd\.spotifyplus\.module\.scripting\.ScriptManager\.",
                    "native_renderer": r"com\.lenerd\.spotifyplus\.module\.scripting\.ScriptViewHost\.",
                    "legacy_hooks": r"com\.lenerd46\.spotifyplus\.hooks\.",
                    "dexkit": r"org\.luckypray\.dexkit\.",
                    "lspatch": r"org\.lsposed\.lspatch\.",
                    "spotify": r"com\.spotify\.",
                    "soloader": r"com\.facebook\.soloader\."
                }.items()}}


def safe_exit_details(text, pid):
    """AOSP ApplicationExitInfo numbers only, restricted to this launched main PID."""
    if not pid or not re.fullmatch(r"[1-9]\d*", str(pid)) or not isinstance(text, str):
        return {"matching_records": 0, "reason_codes": [], "status_codes": []}
    reasons, statuses = [], []
    for block in re.split(r"(?=ApplicationExitInfo(?:\s|:))", text):
        if not (re.search(r"\bpid=" + re.escape(str(pid)) + r"(?:\s|$)", block) and
                re.search(r"\bprocess=com\.spotify\.music(?:\s|$)", block)):
            continue
        reason = re.search(r"\breason=(\d{1,2})(?:\s|$)", block)
        status = re.search(r"\bstatus=(-?\d{1,3})(?:\s|$)", block)
        if reason and 0 <= int(reason[1]) <= 16:
            reasons.append(int(reason[1]))
            if status and -255 <= int(status[1]) <= 255:
                statuses.append(int(status[1]))
    return {"matching_records": len(reasons), "reason_codes": reasons[:4], "status_codes": statuses[:4]}

def collect_startup_details(device, pid, details):
    try:
        # Read only in memory on this logged-out disposable guest. Nothing raw
        # from either buffer is printed, persisted or placed in an artifact.
        log = device.adb("logcat", "-d", timeout=15)
        java_pids = re.findall(r"Process: com\.spotify\.music, PID: (\d+)", log)
        started_pids = re.findall(r"Start proc (\d+):com\.spotify\.music/", log)
        candidate = pid or (java_pids[-1] if java_pids else started_pids[-1] if started_pids else None)
        app_log = device.adb("logcat", "-d", "--pid=" + candidate, timeout=15) if candidate else ""
        details.update(safe_startup_details(app_log))
        details["spotify_activity_start_count"] = sum(bool(re.search(
            r"\bSTART u0\b.*\bcmp=com\.spotify\.music/", line)) for line in log.splitlines())
        details["spotify_deeplink_start_count"] = sum(bool(re.search(
            r"\bSTART u0\b.*\bdat=spotify:.*\bcmp=com\.spotify\.music/", line)) for line in log.splitlines())
        try:
            exit_info = device.shell("dumpsys", "activity", "exit-info", PACKAGE, timeout=15)
            details["process_exit"] = safe_exit_details(exit_info, candidate)
            if 6 in details["process_exit"]["reason_codes"]:
                from lspatch_anr import collect
                details["anr_main_thread"] = collect(device, exit_info, candidate)
        except (RuntimeError, subprocess.SubprocessError):
            details["exit_info_unavailable"] = True
        details["process_observed"] = candidate is not None
        details["spotify_java_crash_reported"] = bool(java_pids)
        details["spotify_native_crash_reported"] = bool(re.search(r">>>\s*com\.spotify\.music\s*<<<", log))
        # Global markers are diagnostic only and can never satisfy startup.
        details["launch_log_markers"] = log_status(log)[0]
        details["spotify_activity_resumed"] = resumed_spotify_activity(
            device.shell("dumpsys", "activity", "activities", PACKAGE, timeout=15))
        lookup = getattr(device, "last_process_lookup", None)
        if isinstance(lookup, dict) and lookup.get("method") == "android_activity_manager":
            details["android_process_lookup"] = {key: lookup[key] for key in
                ("method", "registered_main_processes", "live_main_processes",
                 "package_mentioned", "process_records_present", "main_identity_present") if key in lookup}
        details["diagnostics_collected"] = True
    except (RuntimeError, subprocess.SubprocessError):
        details["diagnostics_collected"] = False

class Device:
    def __init__(self):
        lines = subprocess.run(["adb", "devices"], check=True, capture_output=True, text=True).stdout.splitlines()[1:]
        devices = [line.split()[0] for line in lines if line.endswith("\tdevice")]
        if len(devices) != 1 or not re.fullmatch(r"emulator-\d+", devices[0]):
            raise RuntimeError("Requires exactly one disposable emulator; physical devices are refused")
        self.serial = devices[0]

    def adb(self, *args, timeout=45):
        value = subprocess.run(["adb", "-s", self.serial, *map(str, args)],
                               capture_output=True, text=True, timeout=timeout)
        if value.returncode:
            raise RuntimeError("ADB operation failed (output withheld from public reports)")
        return value.stdout

    def shell(self, *args, **kwargs):
        return self.adb("shell", " ".join(shlex.quote(str(arg)) for arg in args), **kwargs).strip()

    def root(self, enabled):
        self.adb("root" if enabled else "unroot")
        self.adb("wait-for-device", timeout=60)
        if (self.shell("id", "-u") == "0") != enabled:
            raise RuntimeError("AVD could not switch ADB privilege for test setup")

    def pid(self):
        # Native hosts/translation can change process titles or expose multiple
        # name matches. Follow Android's registered main app process instead.
        records = self.shell("dumpsys", "activity", "processes", PACKAGE, timeout=15)
        candidates = activity_manager_pids(records)
        live = [pid for pid in candidates if self.adb("shell",
                "test -d /proc/" + pid + " && echo alive || true", timeout=15).strip() == "alive"]
        self.last_process_lookup = {"method": "android_activity_manager",
                                    "registered_main_processes": len(candidates), "live_main_processes": len(live),
                                    "package_mentioned": PACKAGE in records,
                                    "process_records_present": "ProcessRecord{" in records,
                                    "main_identity_present": bool(re.search(r"\b[1-9]\d*:com\.spotify\.music/", records))}
        return live[0] if len(live) == 1 else None

def check_environment(device, profile=NATIVE):
    if device.shell("getprop", "ro.kernel.qemu") != "1":
        raise RuntimeError("Only disposable Android emulators may be provisioned")
    api = 35 if profile == TRANSLATED35 else 37
    if device.shell("getprop", "ro.build.version.sdk") != str(api):
        raise RuntimeError("Requires API " + str(api) + " for the explicit test profile; no automatic downgrade is allowed")
    abi = device.shell("getprop", "ro.product.cpu.abi")
    if profile == NATIVE:
        if abi != "arm64-v8a":
            raise RuntimeError("Requires native arm64-v8a for the native profile")
        return {"api": api, "abi": abi, "app_abi": "arm64-v8a", "emulator": True,
                "profile": profile, "arm_translation": False}
    if profile == NATIVE_X86:
        if abi != "x86_64" or "arm64-v8a" not in device.shell("getprop", "ro.product.cpu.abilist64").split(","):
            raise RuntimeError("Native x86 emulator profile requires the selected Google compatibility image")
        return {"api": api, "abi": abi, "app_abi": "x86_64", "emulator": True,
                "profile": profile, "arm_translation": False, "arm_compat_advertised": True}
    if profile not in TRANSLATED_PROFILES:
        raise RuntimeError("Unknown emulator test profile")
    if abi != "x86_64":
        raise RuntimeError("Linux translation profile requires an x86_64 guest")
    abis = device.shell("getprop", "ro.product.cpu.abilist64").split(",")
    bridge = device.shell("getprop", "ro.dalvik.vm.native.bridge")
    instruction_set = device.shell("getprop", "ro.dalvik.vm.isa.arm64")
    if "arm64-v8a" not in abis or bridge != "libndk_translation.so" or instruction_set != "x86_64":
        raise RuntimeError("Google ARM64 translation is not available in this guest")
    return {"api": api, "abi": abi, "app_abi": "arm64-v8a", "emulator": True,
            "profile": profile, "arm_translation": True, "native_bridge": bridge,
            "arm64_instruction_set": instruction_set}

def provision(device, apk, extension, profile=NATIVE):
    check_environment(device, profile)
    if device.shell("pm", "list", "packages", PACKAGE):
        raise RuntimeError("Spotify is already installed; use a fresh AVD without an account")
    manifest = json.loads((extension / "manifest.json").read_text())
    if manifest.get("id") != EXTENSION or manifest.get("api") != 2 or manifest.get("main") != "index.js":
        raise RuntimeError("Expected the built Shuffle+ API-2 extension")
    if any(p.is_symlink() for p in extension.rglob("*")) or not (extension / "index.js").is_file():
        raise RuntimeError("Invalid Shuffle+ input folder")
    # Force the original universal APK's ARM64 ABI on the translation profile;
    # a successful native-x86 Spotify launch would not exercise this module.
    selected_abi = app_abi(profile)
    device.adb("install", "--abi", selected_abi, apk, timeout=180)
    package_info = device.shell("dumpsys", "package", PACKAGE)
    if not re.search(r"(?m)^\s*primaryCpuAbi=" + selected_abi + r"(?:\s|$)", package_info):
        raise RuntimeError("Spotify was not installed with the required " + ("ARM64" if selected_abi == "arm64-v8a" else "x86_64") + " ABI")
    match = re.fullmatch(r"package:com\.spotify\.music uid:(\d+)",
                         device.shell("pm", "list", "packages", "-U", PACKAGE))
    if not match:
        raise RuntimeError("Could not resolve the fresh app UID")
    uid = match.group(1)
    device.root(True)
    try:
        staging = "/data/local/tmp/spotifyplus-ci-extension"
        files = "/data/user/0/com.spotify.music/files"
        destination = files + "/spotifyplus-installed-extensions/" + EXTENSION
        device.adb("push", extension, staging, timeout=120)
        device.shell("mkdir", "-p", str(pathlib.PurePosixPath(destination).parent))
        device.shell("cp", "-R", staging, destination)
        device.shell("chown", "-R", uid + ":" + uid, files)
        device.shell("restorecon", "-R", files)
        device.shell("rm", "-rf", staging)
    finally:
        device.root(False)

def launch(device, timeout, details=None):
    details = {} if details is None else details
    device.shell("am", "force-stop", PACKAGE)
    device.adb("logcat", "-c")
    pid, complete = None, False
    try:
        device.shell("am", "start", "-W", "-n", PACKAGE + "/com.spotify.music.MainActivity", timeout=timeout)
        began, stable_until = time.monotonic(), None
        deadline = began + timeout
        while time.monotonic() < deadline:
            current = device.pid()
            if pid and pid != current:
                raise RuntimeError("Spotify process exited or restarted during startup")
            pid = current or pid
            if not pid and time.monotonic() - began > 30:
                raise RuntimeError("Spotify did not keep a running process after launch")
            if pid:
                flags, errors = log_status(device.adb("logcat", "-d", "--pid=" + pid))
                details["last_observed_markers"] = flags
                if errors:
                    raise RuntimeError("Startup error categories: " + ", ".join(errors))
                if time.monotonic() - began > 60 and not (flags["integrated_loader_entered"] and flags["module_entered"]):
                    raise RuntimeError("Integrated LSPatch or Plus module entry was not observed within 60 seconds")
                if all(flags.values()):
                    if stable_until is None:
                        stable_until = time.monotonic() + 15
                    if time.monotonic() >= stable_until:
                        complete = True
                        return {**flags, "stable_after_ready_seconds": 15}, pid
            time.sleep(2)
        raise RuntimeError("Timed out waiting for module, Node host and Shuffle+ loader evidence")
    finally:
        if not complete:
            collect_startup_details(device, pid, details)

def inspect_native_code(device, pid, profile=NATIVE):
    device.root(True)
    try:
        maps = device.shell("cat", "/proc/" + pid + "/maps")
        loaded = {name: name in maps for name in LIBRARIES}
        if not all(loaded.values()):
            raise RuntimeError("Expected Node/JNI/addon mapping is missing")
        if profile in TRANSLATED_PROFILES and "libndk_translation.so" not in maps:
            raise RuntimeError("ARM64 translation library is not mapped in Spotify")
        paths = ["/data/user/0/com.spotify.music/code_cache/spotifyplus-libs/" + name
                 for name in ("libc++_shared.so", "libnode.so", "libnative-lib.so")]
        paths.append("/data/user/0/com.spotify.music/files/nodejs/spotifyplus_bridge.node")
        modes = [device.shell("stat", "-c", "%a", path) for path in paths]
        if any(not re.fullmatch(r"[0-7]{3,4}", mode) or int(mode, 8) & 0o222 for mode in modes):
            raise RuntimeError("Extracted native code is writable")
        return {"mapped": loaded, "extracted_native_code_read_only": True,
                "arm_translation_verified": profile in TRANSLATED_PROFILES}
    finally:
        device.root(False)

def original_control(device, original, profile, abi="arm64-v8a", timeout=60):
    """Only called after this harness installed the disposable patched app."""
    from prepare_lspatch_smoke import checksum, ORIGINAL_SHA
    check_environment(device, profile)
    if (abi not in ("arm64-v8a", "x86_64") or
            (abi == "x86_64" and profile not in (*TRANSLATED_PROFILES, NATIVE_X86)) or
            (profile == NATIVE_X86 and abi != "x86_64")):
        raise RuntimeError("Invalid original-control ABI")
    if checksum(original) != ORIGINAL_SHA:
        raise RuntimeError("Original control requires the exact pinned unpatched APK")
    result = {"test_kind": "unpatched_original_control", "app_abi": abi,
              "passed": False, "stage": "install", "account_test_executed": False, "playback_test_executed": False}
    pid = None
    try:
        device.adb("logcat", "-c")
        device.adb("uninstall", PACKAGE, timeout=120)
        device.adb("install", "--abi", abi, original, timeout=180)
        package = device.shell("dumpsys", "package", PACKAGE)
        if not re.search(r"(?m)^\s*primaryCpuAbi=" + re.escape(abi) + r"(?:\s|$)", package):
            raise RuntimeError("Original control was not installed with its requested ABI")
        result["stage"] = "launch"
        device.shell("am", "start", "-W", "-n", PACKAGE + "/com.spotify.music.MainActivity", timeout=60)
        result["stage"] = "readiness"
        deadline, stable_until = time.monotonic() + timeout, None
        while time.monotonic() < deadline:
            current = device.pid()
            if pid and current != pid:
                raise RuntimeError("Original control process exited or restarted")
            pid = current or pid
            if pid:
                if stable_until is None:
                    stable_until = time.monotonic() + 15
                if time.monotonic() >= stable_until:
                    activities = device.shell("dumpsys", "activity", "activities", PACKAGE, timeout=15)
                    resumed = resumed_spotify_activity(activities)
                    result.update({"process_stable_seconds": 15, "resumed_activity_observed": resumed,
                                   "passed": resumed})
                    if not resumed:
                        raise RuntimeError("Original control did not expose a resumed Spotify activity")
                    return result
            time.sleep(2)
        raise RuntimeError("Original control did not keep a registered process")
    except (RuntimeError, subprocess.SubprocessError) as error:
        result["failure"] = str(error) if isinstance(error, RuntimeError) else "Original control ADB operation timed out"
        collect_startup_details(device, pid, result)
        return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=pathlib.Path)
    parser.add_argument("--extension", type=pathlib.Path)
    parser.add_argument("--check-environment", action="store_true")
    parser.add_argument("--original-control", type=pathlib.Path,
                        help="After a failed patched startup, compare the pinned original on this disposable guest")
    parser.add_argument("--device-profile", choices=(NATIVE, NATIVE_X86, *TRANSLATED_PROFILES), default=NATIVE)
    parser.add_argument("--report", type=pathlib.Path, required=True)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    if not args.check_environment and (not args.apk or not args.extension):
        parser.error("Patched-host testing requires --apk and --extension")
    report = {"test_kind": ("android35_environment_only" if args.device_profile == TRANSLATED35 else "android37_environment_only") if args.check_environment else "logged_out_lspatch_startup", "passed": False,
              "emulation_mode": os.environ.get("SPOTIFYPLUS_EMULATION_MODE", "unspecified"),
              "signature_bypass_level": int(os.environ.get("SPOTIFYPLUS_SIGNATURE_BYPASS_LEVEL", "0")),
              "module_artifact_run_id": os.environ.get("MODULE_ARTIFACT_RUN", "") if re.fullmatch(r"\d{1,20}", os.environ.get("MODULE_ARTIFACT_RUN", "")) else "unspecified",
              "module_artifact_commit": os.environ.get("MODULE_ARTIFACT_COMMIT", "") if re.fullmatch(r"[0-9a-f]{40}", os.environ.get("MODULE_ARTIFACT_COMMIT", "")) else "unspecified",
              "device_profile": args.device_profile, "required_api": 35 if args.device_profile == TRANSLATED35 else 37, "required_app_abi": app_abi(args.device_profile), "launches": [], "startup_attempts": [],
              "playback_test_executed": False, "account_test_executed": False,
              "shuffle_ui_test_executed": False,
              "patched_host_test_executed": False,
              "limitation": "Generic AVD; Samsung firmware, authenticated playback, queue ordering and extension UI interaction require separate acceptance tests."}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        device = Device()
        report["environment"] = check_environment(device, args.device_profile)
        if not args.check_environment:
            report["stage"] = "install_and_provision"
            provision(device, args.apk, args.extension, args.device_profile)
            report["installed_app_abi"] = app_abi(args.device_profile)
            report["patched_host_test_executed"] = True
            for _ in range(2):
                report["stage"] = "launch_" + str(len(report["launches"]) + 1)
                details = {}
                report["startup_attempts"].append(details)
                result, pid = launch(device, args.timeout, details)
                report["stage"] = "inspect_native_code"
                result["native_code"] = inspect_native_code(device, pid, args.device_profile)
                if device.pid() != pid:
                    raise RuntimeError("Spotify exited during native code inspection")
                report["launches"].append(result)
        report["passed"] = True
    except (RuntimeError, subprocess.SubprocessError) as error:
        # All RuntimeError messages above are fixed categories, not raw output.
        report["failure"] = str(error) if isinstance(error, RuntimeError) else "ADB command timed out or could not run"
        if report["patched_host_test_executed"] and args.original_control:
            try:
                control = original_control(device, args.original_control, args.device_profile, app_abi(args.device_profile))
                report["original_controls"] = [control]
                if not control["passed"] and args.device_profile in TRANSLATED_PROFILES:
                    report["original_controls"].append(original_control(device, args.original_control, args.device_profile, "x86_64"))
            except (RuntimeError, subprocess.SubprocessError, OSError):
                report["original_control_unavailable"] = True
        # A passing control never changes the failed patched-host verdict.
        raise SystemExit(report["failure"]) from None
    finally:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        # The report contains fixed diagnostic categories, never raw device logs.
        print("STARTUP_REPORT " + json.dumps(report, sort_keys=True), flush=True)
    print("PASS: Android API " + str(report["required_api"]) + " emulator environment (" + args.device_profile + ")" if args.check_environment else
          "PASS: two non-root app starts, Node/JNI loading, Shuffle+ loader and read-only native code")

if __name__ == "__main__":
    main()
