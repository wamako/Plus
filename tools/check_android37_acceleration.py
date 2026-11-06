#!/usr/bin/env python3
"""Report host virtualization capability without claiming an Android boot."""
import json
import os
import pathlib
import subprocess

def assess(probe_code, runner_environment, try_software=False):
    # GitHub documents no nested virtualization on its hosted ARM Macs. A
    # framework probe alone cannot prove a VM may create another VM.
    hosted = runner_environment == "github-hosted"
    supported = probe_code == 0 and not hosted
    mode = "hardware" if supported else "software" if hosted and try_software else "unavailable"
    return {"test_kind": "android37_host_acceleration", "accelerator_usable": supported,
            "accelerator_probe_success": probe_code == 0, "github_hosted_arm_mac": hosted,
            "emulator_boot_executed": False, "patched_host_test_executed": False,
            "passed": None, "boot_mode": mode,
            "result": "accelerator_available" if supported else
                      "software_trial_requested" if mode == "software" else "unsupported_runner"}

def main():
    root = pathlib.Path(os.environ["RUNNER_TEMP"])
    result = subprocess.run([str(pathlib.Path(os.environ["ANDROID_HOME"]) / "emulator/emulator"), "-accel-check"],
                            capture_output=True, text=True, timeout=30)
    report = assess(result.returncode, os.environ.get("RUNNER_ENVIRONMENT"),
                    os.environ.get("SPOTIFYPLUS_TRY_SOFTWARE") == "true")
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

if __name__ == "__main__":
    main()
