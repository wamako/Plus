#!/usr/bin/env python3
"""Download checksum-pinned test inputs and patch Spotify; never upload host APKs.

SPOTIFY_APK_URL must be an HTTPS URL supplied through a repository secret. No
Spotify account, token or API key is used. The original stays in the job temp dir.
"""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import urllib.request

from verify_lspatched_package import JAR_SHA, verify

ORIGINAL_SHA = "a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304"
PATCHER_URL = "https://github.com/JingMatrix/LSPatch/releases/download/v1.2/lspatch-v1.2-487-release.jar"

def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def download(url, path, expected):
    # Do not include URLs (which may be signed), HTTP headers or response bodies
    # in errors, patcher logs, reports or Actions artifacts.
    if not url.startswith("https://"):
        raise ValueError("An HTTPS test-input URL is required")
    try:
        with urllib.request.urlopen(url, timeout=120) as response, path.open("wb") as out:
            if not response.url.startswith("https://"):
                raise ValueError("Insecure test-input redirect")
            shutil.copyfileobj(response, out)
    except Exception:
        path.unlink(missing_ok=True)
        raise RuntimeError("Test input could not be downloaded; check the configured HTTPS source") from None
    if checksum(path) != expected:
        path.unlink()
        raise ValueError("Test input SHA-256 does not match the pinned version")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--module", required=True, type=pathlib.Path)
    parser.add_argument("--work", required=True, type=pathlib.Path)
    parser.add_argument("--report", required=True, type=pathlib.Path)
    args = parser.parse_args()
    url = os.environ.get("SPOTIFY_APK_URL", "")
    if not url:
        raise SystemExit("Set the SPOTIFY_APK_URL repository secret to the original Spotify 9.1.94.1929 APK HTTPS source")
    args.work.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    original, jar = args.work / "spotify-original.apk", args.work / "lspatch-487.jar"
    download(url, original, ORIGINAL_SHA)
    download(PATCHER_URL, jar, JAR_SHA)
    output = args.work / "patched"
    # No debug or SDK override: exercise the target-37 integrated patch as-is.
    with (args.work / "patcher.log").open("w") as log:
        subprocess.run(["java", "-jar", str(jar), "-o", str(output), "-m",
                        str(args.module.resolve()), str(original)], check=True, stdout=log, stderr=log)
    patched, = output.glob("*.apk")
    result = verify(original, args.module, jar, patched, checksum(args.module))
    classes = args.work / "verifier"
    classes.mkdir(exist_ok=True)
    source = pathlib.Path(__file__).with_name("VerifyLspatchSignature.java")
    subprocess.run(["javac", "-proc:none", "-cp", str(jar), "-d", str(classes), str(source)], check=True)
    signature = subprocess.run(["java", "-cp", str(classes) + os.pathsep + str(jar),
                                "VerifyLspatchSignature", str(patched)], check=True, capture_output=True, text=True)
    result["signature"] = json.loads(signature.stdout)
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    # Fixed local name for the device runner; paths and private URLs stay local.
    patched.rename(args.work / "spotify-lspatched.apk")
    print("Verified integrated LSPatch 1.2 (487) package and APK signature")

if __name__ == "__main__":
    main()
