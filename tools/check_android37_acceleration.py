#!/usr/bin/env python3
"""Report host virtualization capability without claiming an Android boot."""
import json
import os
import pathlib
import re
import subprocess

def assess(probe_code, runner_environment, try_software=False, tcg_available=False):
    # GitHub documents no nested virtualization on its hosted ARM Macs. A
    # framework probe alone cannot prove a VM may create another VM.
    hosted = runner_environment == "github-hosted"
    supported = probe_code == 0 and not hosted
    mode = "hardware" if supported else "software" if hosted and try_software and tcg_available else "unavailable"
    return {"test_kind": "android37_host_acceleration", "accelerator_usable": supported,
            "accelerator_probe_success": probe_code == 0, "github_hosted_arm_mac": hosted,
            "emulator_boot_executed": False, "patched_host_test_executed": False,
            "passed": None, "boot_mode": mode, "software_backend_available": tcg_available,
            "result": "accelerator_available" if supported else
                      "software_trial_requested" if mode == "software" else "unsupported_runner"}

def main():
    root = pathlib.Path(os.environ["RUNNER_TEMP"])
    result = subprocess.run([str(pathlib.Path(os.environ["ANDROID_HOME"]) / "emulator/emulator"), "-accel-check"],
                            capture_output=True, text=True, timeout=30)
    emulator_root = pathlib.Path(os.environ["ANDROID_HOME"]) / "emulator"
    binaries = list((emulator_root / "qemu").glob("*/qemu-system-aarch64-headless"))
    backends, backend_code, probe_codes = [], None, []
    backend_error = None
    if len(binaries) == 1:
        # The normal emulator launcher provides this environment for QEMU.
        # Without it the standalone probe may abort in dyld before parsing args.
        probe_env = {**os.environ, "ANDROID_EMULATOR_LAUNCHER_DIR": str(emulator_root),
                     "DYLD_LIBRARY_PATH": str(emulator_root / "lib64") +
                     (":" + os.environ["DYLD_LIBRARY_PATH"] if os.environ.get("DYLD_LIBRARY_PATH") else "")}
        # Some SDK binaries parse Android launcher options before QEMU options.
        for args in (("-accel", "help"), ("-qemu", "-accel", "help")):
            probe = subprocess.run([str(binaries[0]), *args], capture_output=True, text=True,
                                   timeout=30, cwd=emulator_root, env=probe_env)
            backend_code = probe.returncode
            probe_codes.append(probe.returncode)
            text = probe.stdout + "\n" + probe.stderr
            if probe.returncode == 0:
                backends = [name for name in ("tcg", "hvf", "kvm", "whpx") if re.search(r"(?m)^\s*" + name + r"\s*$", text)]
                if backends:
                    backend_error = None
                    break
                backend_error = "unrecognized_backend_help"
            elif "Library not loaded" in text:
                backend_error = "sdk_dynamic_library_unavailable"
            else:
                backend_error = "native_probe_could_not_run"
    report = assess(result.returncode, os.environ.get("RUNNER_ENVIRONMENT"),
                    os.environ.get("SPOTIFYPLUS_TRY_SOFTWARE") == "true", "tcg" in backends if backends else None)
    report.update({"qemu_backend_probe_exit_code": backend_code, "qemu_accelerators": backends,
                   "qemu_backend_probe_error": backend_error, "qemu_probe_attempt_codes": probe_codes})
    directory = root / "smoke-reports"
    directory.mkdir(exist_ok=True)
    (directory / "acceleration.json").write_text(json.dumps(report, indent=2) + "\n")
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        out.write("supported=" + str(report["accelerator_usable"]).lower() + "\n")
        out.write("boot_mode=" + report["boot_mode"] + "\n")
    if report["boot_mode"] == "software":
        print("::notice::Trying bounded ARM64 software emulation without a hypervisor. This is experimental and does not claim an Android boot or Spotify pass.")
        return
    print("Host accelerator is usable" if report["accelerator_usable"] else
          "::notice::Host accelerator unavailable. No Android/Spotify runtime test was run; use an ARM Mac runner with usable Hypervisor.framework.")
    print("QEMU accelerator backends: " + ", ".join(backends))

if __name__ == "__main__":
    main()
