#!/usr/bin/env python3
"""Exercise the actual patched host and Shuffle+ loader on a disposable ARM AVD.

This is a logged-out startup test, not a Spotify playback/account test. Root ADB
is used only to provision/inspect the disposable AVD; each app launch runs with
ADB unrooted and LSPatch in integrated mode. Refuses physical/populated devices.
No raw logcat, UI dumps, APKs, account data or credentials are written to reports.
"""
import argparse
import json
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

def log_status(log):
    return ({name: marker in log for name, marker in MARKERS.items()},
            [name for name, marker in ERRORS.items() if marker in log])

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
        # pidof returns exit 1 while the process is absent.
        value = self.adb("shell", "pidof com.spotify.music || true").strip()
        return value if re.fullmatch(r"\d+", value) else None

def provision(device, apk, extension):
    if device.shell("getprop", "ro.kernel.qemu") != "1":
        raise RuntimeError("Only disposable Android emulators may be provisioned")
    if device.shell("getprop", "ro.build.version.sdk") != "37":
        raise RuntimeError("Requires API 37; no automatic API downgrade is allowed")
    if device.shell("getprop", "ro.product.cpu.abi") != "arm64-v8a":
        raise RuntimeError("Requires native arm64-v8a; translated x86 tests are refused")
    if device.shell("pm", "list", "packages", PACKAGE):
        raise RuntimeError("Spotify is already installed; use a fresh AVD without an account")
    manifest = json.loads((extension / "manifest.json").read_text())
    if manifest.get("id") != EXTENSION or manifest.get("api") != 2 or manifest.get("main") != "index.js":
        raise RuntimeError("Expected the built Shuffle+ API-2 extension")
    if any(p.is_symlink() for p in extension.rglob("*")) or not (extension / "index.js").is_file():
        raise RuntimeError("Invalid Shuffle+ input folder")
    device.adb("install", apk, timeout=180)
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

def launch(device, timeout):
    device.shell("am", "force-stop", PACKAGE)
    device.adb("logcat", "-c")
    device.shell("am", "start", "-W", "-n", PACKAGE + "/com.spotify.music.MainActivity", timeout=90)
    deadline, stable_until, pid = time.monotonic() + timeout, None, None
    while time.monotonic() < deadline:
        current = device.pid()
        if pid and pid != current:
            raise RuntimeError("Spotify process exited or restarted during startup")
        pid = current or pid
        if pid:
            flags, errors = log_status(device.adb("logcat", "-d", "--pid=" + pid))
            if errors:
                raise RuntimeError("Startup error categories: " + ", ".join(errors))
            if all(flags.values()):
                if stable_until is None:
                    stable_until = time.monotonic() + 15
                if time.monotonic() >= stable_until:
                    return {**flags, "stable_after_ready_seconds": 15}, pid
        time.sleep(2)
    raise RuntimeError("Timed out waiting for module, Node host and Shuffle+ loader evidence")

def inspect_native_code(device, pid):
    device.root(True)
    try:
        maps = device.shell("cat", "/proc/" + pid + "/maps")
        loaded = {name: name in maps for name in LIBRARIES}
        if not all(loaded.values()):
            raise RuntimeError("Expected Node/JNI/addon mapping is missing")
        paths = ["/data/user/0/com.spotify.music/code_cache/spotifyplus-libs/" + name
                 for name in ("libc++_shared.so", "libnode.so", "libnative-lib.so")]
        paths.append("/data/user/0/com.spotify.music/files/nodejs/spotifyplus_bridge.node")
        modes = [device.shell("stat", "-c", "%a", path) for path in paths]
        if any(not re.fullmatch(r"[0-7]{3,4}", mode) or int(mode, 8) & 0o222 for mode in modes):
            raise RuntimeError("Extracted native code is writable on Android 17")
        return {"mapped": loaded, "extracted_native_code_read_only": True}
    finally:
        device.root(False)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=pathlib.Path, required=True)
    parser.add_argument("--extension", type=pathlib.Path, required=True)
    parser.add_argument("--report", type=pathlib.Path, required=True)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    report = {"test_kind": "logged_out_lspatch_startup", "passed": False,
              "required_api": 37, "required_abi": "arm64-v8a", "launches": [],
              "playback_test_executed": False, "account_test_executed": False,
              "shuffle_ui_test_executed": False,
              "limitation": "Generic AVD; Samsung firmware, authenticated playback, queue ordering and extension UI interaction require separate acceptance tests."}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        device = Device()
        provision(device, args.apk, args.extension)
        for _ in range(2):
            result, pid = launch(device, args.timeout)
            result["native_code"] = inspect_native_code(device, pid)
            if device.pid() != pid:
                raise RuntimeError("Spotify exited during native code inspection")
            report["launches"].append(result)
        report["passed"] = True
    except (RuntimeError, subprocess.SubprocessError) as error:
        # All RuntimeError messages above are fixed categories, not raw output.
        report["failure"] = str(error) if isinstance(error, RuntimeError) else "ADB command timed out or could not run"
        raise SystemExit(report["failure"]) from None
    finally:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("PASS: two non-root app starts, Node/JNI loading, Shuffle+ loader and read-only native code")

if __name__ == "__main__":
    main()
