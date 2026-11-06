#!/usr/bin/env python3
"""Install official SDK tools supporting Android's 37.0 packages."""
import hashlib
import os
import pathlib
import platform
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

# Stable command-line tools 23.0, as published in Google's repository inventory.
URL = "https://dl.google.com/android/repository/commandlinetools-mac_arm64-16111833_latest.zip"
SHA1 = "ad03dc49bfacfd52c110b14104ea548b8a07e830"
LINUX_URL = "https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip"
LINUX_SHA1 = "e025545c62a8e64c7559119566a569fb1dec5f60"

def main():
    if platform.system() == "Linux" and platform.machine() == "x86_64":
        url, expected = LINUX_URL, LINUX_SHA1
    elif platform.system() == "Darwin" and platform.machine() == "arm64":
        url, expected = URL, SHA1
    else:
        raise SystemExit("Requires Linux x86_64 or macOS ARM64 SDK host")
    root = pathlib.Path(os.environ["RUNNER_TEMP"]) / "spotifyplus-android-sdk"
    tools = root / "cmdline-tools/latest"
    if tools.exists():
        raise SystemExit("Use a fresh job SDK directory")
    with tempfile.TemporaryDirectory() as temp:
        archive = pathlib.Path(temp) / "tools.zip"
        with urllib.request.urlopen(url, timeout=120) as source, archive.open("wb") as target:
            shutil.copyfileobj(source, target)
        with archive.open("rb") as stream:
            if hashlib.file_digest(stream, "sha1").hexdigest() != expected:
                raise SystemExit("Official SDK tools checksum mismatch")
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                path = pathlib.PurePosixPath(name)
                if path.is_absolute() or ".." in path.parts:
                    raise SystemExit("Invalid SDK archive path")
            source.extractall(pathlib.Path(temp) / "unpacked")
        tools.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(pathlib.Path(temp) / "unpacked/cmdline-tools"), tools)
    for binary in (tools / "bin").iterdir():
        if binary.is_file():
            binary.chmod(0o755)
    env = {**os.environ, "ANDROID_HOME": str(root), "ANDROID_SDK_ROOT": str(root)}
    manager = str(tools / "bin/sdkmanager")
    subprocess.run([manager, "--sdk_root=" + str(root), "--licenses"],
                   input="y\n" * 200, text=True, check=True, env=env)
    subprocess.run([manager, "--sdk_root=" + str(root), "platform-tools", "emulator"], check=True, env=env)
    with open(os.environ["GITHUB_ENV"], "a") as out:
        out.write(f"ANDROID_HOME={root}\nANDROID_SDK_ROOT={root}\n")
    with open(os.environ["GITHUB_PATH"], "a") as out:
        for path in [tools / "bin", root / "platform-tools", root / "emulator"]:
            out.write(str(path) + "\n")
    print("Installed official SDK tools 23.0 for Android 37.0")

if __name__ == "__main__":
    main()
