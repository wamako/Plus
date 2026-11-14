#!/usr/bin/env python3
"""Reproduce the retained bundle from the exact verified R11 module."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from prepare_api2 import LYRICS, NODE_SHA, R11_SHA, ROOT
from runtime_inputs import NODE, checksum, verify_bundle


def package(donor, output, manifest):
    if checksum(donor) != R11_SHA:
        raise ValueError("Requires the exact verified R11 binary donor")
    prefix = "assets/api2-extensions/beautiful-lyrics/"
    with zipfile.ZipFile(donor) as archive:
        payloads = {"lyrics/" + name.removeprefix(prefix): archive.read(name)
                    for name in archive.namelist() if name.startswith(prefix) and not name.endswith("/")}
        payloads[NODE] = archive.read("lib/arm64-v8a/libnode.so")
    if hashlib.sha256(payloads[NODE]).hexdigest() != NODE_SHA:
        raise ValueError("Pinned ARM Node donor changed")
    payloads["licenses/node/LICENSE.txt"] = (ROOT / "third_party/nodejs-mobile-18.20.4-LICENSE.txt").read_bytes()
    payloads["licenses/spotify-plus/LICENSE.txt"] = (ROOT / "LICENSE").read_bytes()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, payload in sorted(payloads.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, payload, compresslevel=9)
    spec = {
        "format": 1,
        "donor_sha256": R11_SHA,
        "provenance": {"run": "42078701459", "commit": "a757c196c56eb57fa0be3fe5e9314563f62b2f25",
                       "node_version": "18.20.4", "lyrics_commit": LYRICS},
        "archive": {"url": "https://github.com/wamako/Plus/releases/download/build-inputs-r11-v1/runtime-inputs-r11-v1.zip",
                    "sha256": checksum(output), "size": output.stat().st_size},
        "entries": {name: {"sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload)}
                    for name, payload in sorted(payloads.items())},
    }
    verify_bundle(output, spec)
    manifest.write_text(json.dumps(spec, indent=2) + "\n")
    print(json.dumps({"archive_sha256": spec["archive"]["sha256"], "bytes": spec["archive"]["size"],
                      "verified_entries": len(payloads)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--donor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, default=ROOT / "tools/runtime-inputs.json")
    args = parser.parse_args()
    package(args.donor, args.output, args.manifest)
