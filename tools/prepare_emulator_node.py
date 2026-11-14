#!/usr/bin/env python3
"""Install only the pinned official x86_64 Node library for an emulator build."""
import argparse
import hashlib
import json
import pathlib
import shutil
import struct
import tempfile
import urllib.request
import zipfile
from prepare_lspatch_smoke import HTTPSRedirects

URL = "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip"
ARCHIVE_SHA = "bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af"
NODE_SHA = "9acba7e26a1e864f13b78f1b7121773643f3f33a4c6a2fe7d4f63eb06d4d3af1"
HEADERS = ("node_version.h", "v8-version.h", "v8config.h", "node_api.h")

def install(archive, source):
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != ARCHIVE_SHA:
            raise ValueError("Official emulator Node archive checksum mismatch")
    with zipfile.ZipFile(archive) as package:
        for name in HEADERS:
            expected = (source / "app/libnode/include/node" / name).read_bytes()
            if package.read("include/node/" + name) != expected:
                raise ValueError("Emulator Node headers do not match the pinned runtime headers")
        node = package.read("bin/x86_64/libnode.so")
    if (hashlib.sha256(node).hexdigest() != NODE_SHA or node[:6] != b"\x7fELF\x02\x01" or
            struct.unpack_from("<H", node, 18)[0] != 62 or b"v18.20.4" not in node):
        raise ValueError("Unexpected emulator Node binary/version/architecture")
    target = source / "app/libnode/bin/x86_64/libnode.so"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(node)
    return {"test_kind": "emulator_node_input", "abi": "x86_64", "node_version": "18.20.4",
            "sha256": NODE_SHA, "headers_match_pinned_source": True}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=pathlib.Path, default=pathlib.Path("app/api2-source"))
    parser.add_argument("--archive", type=pathlib.Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        archive = args.archive or pathlib.Path(temp) / "node.zip"
        if not args.archive:
            try:
                opener = urllib.request.build_opener(HTTPSRedirects())
                with opener.open(URL, timeout=120) as response, archive.open("wb") as target:
                    shutil.copyfileobj(response, target)
            except Exception:
                raise SystemExit("Official emulator Node archive could not be downloaded") from None
        result = install(archive, args.source)
        root = pathlib.Path(__file__).resolve().parents[1]
        notices = root / "app/api2-assets/licenses"
        notices.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / "third_party/nodejs-mobile-18.20.4-LICENSE.txt",
                        notices / "nodejs-mobile-18.20.4-LICENSE.txt")
        print(json.dumps(result))

if __name__ == "__main__":
    main()
