#!/usr/bin/env python3
"""Check Google's structured image inventory, not a changing CLI table format."""
import json
import argparse
import os
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

URL = "https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-5.xml"
PACKAGE = "system-images;android-37.0;google_apis;arm64-v8a"

def inspect(data, abi="arm64-v8a", api_level="37.0"):
    if abi not in ("arm64-v8a", "x86_64"):
        raise ValueError("Unsupported test image ABI")
    if api_level not in ("37.0", "35"):
        raise ValueError("Unsupported explicit image API")
    package = "system-images;android-" + api_level + ";google_apis;" + abi
    node = next((item for item in ET.fromstring(data).iter() if item.get("path") == package), None)
    if node is None:
        raise ValueError("Exact selected Google APIs image is not listed")
    if node.findtext(".//api-level") != api_level or node.findtext(".//abi") != abi:
        raise ValueError("Unexpected image API or ABI metadata")
    channel = node.find("channelRef")
    if channel is None or channel.get("ref") != "channel-0":
        raise ValueError("Expected the stable selected Android image")
    return {"test_kind": "sdk_image_inventory", "package": package, "listed": True,
            "api_level": api_level, "abi": abi, "runtime_test_executed": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--abi", choices=("arm64-v8a", "x86_64"), default="arm64-v8a")
    parser.add_argument("--api-level", choices=("37.0", "35"), default="37.0")
    args = parser.parse_args()
    with urllib.request.urlopen(URL, timeout=45) as source:
        report = inspect(source.read(), args.abi, args.api_level)
    directory = pathlib.Path(os.environ["RUNNER_TEMP"]) / "smoke-reports"
    directory.mkdir(exist_ok=True)
    (directory / "image-inventory.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Verified stable SDK image inventory: " + report["package"])

if __name__ == "__main__":
    main()
