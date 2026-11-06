#!/usr/bin/env python3
"""Check Google's structured image inventory, not a changing CLI table format."""
import json
import os
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

URL = "https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-5.xml"
PACKAGE = "system-images;android-37.0;google_apis;arm64-v8a"

def inspect(data):
    node = next((item for item in ET.fromstring(data).iter() if item.get("path") == PACKAGE), None)
    if node is None:
        raise ValueError("Exact Android 37.0 Google APIs ARM64 image is not listed")
    if node.findtext(".//api-level") != "37.0" or node.findtext(".//abi") != "arm64-v8a":
        raise ValueError("Unexpected image API or ABI metadata")
    channel = node.find("channelRef")
    if channel is None or channel.get("ref") != "channel-0":
        raise ValueError("Expected the stable Android 37.0 image")
    return {"test_kind": "sdk_image_inventory", "package": PACKAGE, "listed": True,
            "api_level": "37.0", "abi": "arm64-v8a", "runtime_test_executed": False}

def main():
    with urllib.request.urlopen(URL, timeout=45) as source:
        report = inspect(source.read())
    directory = pathlib.Path(os.environ["RUNNER_TEMP"]) / "smoke-reports"
    directory.mkdir(exist_ok=True)
    (directory / "image-inventory.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Verified stable SDK image inventory: " + PACKAGE)

if __name__ == "__main__":
    main()
