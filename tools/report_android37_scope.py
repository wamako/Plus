#!/usr/bin/env python3
"""Report actual guest evidence separately from an optional software trial."""
import json
import os
import pathlib

def classify(mode, outcome, environment, probe_only=False):
    guest = (environment.get("passed") is True and
             environment.get("test_kind") == "android37_arm64_environment_only" and
             environment.get("environment", {}).get("api") == 37 and
             environment.get("environment", {}).get("abi") == "arm64-v8a")
    result = ("capabilities_only" if probe_only else "booted" if guest else "software_boot_failed" if mode == "software" and outcome == "failure"
              else "unsupported_runner" if mode == "unavailable" else "setup_failed")
    return {"test_kind": "android37_boot_result", "emulation_mode": mode, "result": result,
            "passed": True if guest else False if outcome in ("success", "failure") else None,
            "emulator_boot_attempted": outcome in ("success", "failure"),
            "guest_api_abi_verified": guest}

def main():
    directory = pathlib.Path(os.environ["RUNNER_TEMP"]) / "smoke-reports"
    directory.mkdir(exist_ok=True)
    path = directory / "environment.json"
    environment = json.loads(path.read_text()) if path.exists() else {}
    report = classify(os.environ.get("BOOT_MODE", "unavailable"), os.environ.get("BOOT_RESULT", "skipped"), environment,
                      os.environ.get("PROBE_ONLY") == "true")
    (directory / "boot-result.json").write_text(json.dumps(report, indent=2) + "\n")
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        out.write("environment_result=" + report["result"] + "\n")
    if os.environ.get("BOOT_RESULT") == "success" and not report["guest_api_abi_verified"]:
        raise SystemExit("Emulator action returned success without valid API 37 ARM64 guest evidence")
    print("Android guest result: " + report["result"] + "; patched startup remains a separate report")

if __name__ == "__main__":
    main()
