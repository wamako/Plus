#!/usr/bin/env python3
"""Report actual guest evidence separately from an optional software trial."""
import json
import os
import pathlib
from run_lspatch_smoke import NATIVE, NATIVE_X86, TRANSLATED, TRANSLATED35, TRANSLATED_PROFILES

def classify(mode, outcome, environment, probe_only=False, profile=NATIVE):
    details = environment.get("environment", {})
    abi_valid = (profile == NATIVE and details.get("abi") == "arm64-v8a" and not details.get("arm_translation"))
    if profile == NATIVE_X86:
        abi_valid = (details.get("profile") == NATIVE_X86 and details.get("abi") == "x86_64" and
                     details.get("app_abi") == "x86_64" and details.get("emulator") is True and
                     details.get("arm_translation") is False and details.get("arm_compat_advertised") is True)
    if profile in TRANSLATED_PROFILES:
        abi_valid = (details.get("profile") == profile and details.get("abi") == "x86_64" and
                     details.get("app_abi") == "arm64-v8a" and details.get("emulator") is True and
                     details.get("arm_translation") is True and
                     details.get("native_bridge") == "libndk_translation.so" and
                     details.get("arm64_instruction_set") == "x86_64")
    guest = (environment.get("passed") is True and
             environment.get("test_kind") in ("android37_environment_only", "android37_arm64_environment_only", "android35_environment_only") and
             details.get("api") == (35 if profile == TRANSLATED35 else 37) and abi_valid)
    result = ("capabilities_only" if probe_only else "booted" if guest else "software_boot_failed" if mode == "software" and outcome == "failure"
              else "unsupported_runner" if mode == "unavailable" else "setup_failed")
    return {"test_kind": "android_boot_result", "emulation_mode": mode, "result": result,
            "device_profile": profile, "guest_api": details.get("api"), "native_arm64_test": guest and profile == NATIVE,
            "native_x86_test": guest and profile == NATIVE_X86,
            "arm64_translation_test": guest and profile in TRANSLATED_PROFILES,
            "passed": True if guest else False if outcome in ("success", "failure") else None,
            "emulator_boot_attempted": outcome in ("success", "failure"),
            "guest_api_abi_verified": guest}

def main():
    directory = pathlib.Path(os.environ["RUNNER_TEMP"]) / "smoke-reports"
    directory.mkdir(exist_ok=True)
    path = directory / "environment.json"
    environment = json.loads(path.read_text()) if path.exists() else {}
    report = classify(os.environ.get("BOOT_MODE", "unavailable"), os.environ.get("BOOT_RESULT", "skipped"), environment,
                      os.environ.get("PROBE_ONLY") == "true", os.environ.get("DEVICE_PROFILE", NATIVE))
    (directory / "boot-result.json").write_text(json.dumps(report, indent=2) + "\n")
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        out.write("environment_result=" + report["result"] + "\n")
    if os.environ.get("BOOT_RESULT") == "success" and not report["guest_api_abi_verified"]:
        raise SystemExit("Emulator action returned success without valid guest/profile evidence")
    print("Android guest result: " + report["result"] + "; patched startup remains a separate report")

if __name__ == "__main__":
    main()
