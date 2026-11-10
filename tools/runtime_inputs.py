#!/usr/bin/env python3
"""Fetch and materialize the checksum-pinned, retained Node/Lyrics inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import urllib.parse
import urllib.request
import zipfile

MANIFEST = Path(__file__).with_name("runtime-inputs.json")
NODE = "node/arm64-v8a/libnode.so"
DONOR_SHA = "176aac1fec257cf18b7f2fc002f5cad2be2f9cc774a69694094e34555abb5df2"
MAX_ARCHIVE = 300 * 1024 * 1024
MAX_ENTRY = 70 * 1024 * 1024


def checksum(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def load_spec(path=MANIFEST):
    return json.loads(Path(path).read_text())


def validate_spec(spec):
    if type(spec.get("format")) is not int or spec["format"] != 1 or spec.get("donor_sha256") != DONOR_SHA:
        raise ValueError("Unsupported runtime input manifest")
    archive, entries = spec.get("archive", {}), spec.get("entries", {})
    if (type(archive.get("size")) is not int or not 0 < archive["size"] <= MAX_ARCHIVE or
            not re.fullmatch(r"[0-9a-f]{64}", str(archive.get("sha256", ""))) or
            urllib.parse.urlsplit(archive.get("url", "")).scheme != "https"):
        raise ValueError("Invalid runtime archive identity")
    required = {NODE, "lyrics/LICENSE", "lyrics/index.js", "lyrics/manifest.json", "lyrics/lyrics.apk"}
    if not isinstance(entries, dict) or not required.issubset(entries) or len(entries) > 256:
        raise ValueError("Incomplete runtime input manifest")
    for name, entry in entries.items():
        path = PurePosixPath(name)
        if (not name or "\\" in name or any(ord(c) < 32 for c in name) or path.is_absolute() or
                path.as_posix() != name or ".." in path.parts or
                not (name == NODE or (len(path.parts) > 1 and path.parts[0] in ("lyrics", "licenses")))):
            raise ValueError("Unsafe runtime input path")
        if (type(entry.get("size")) is not int or not 0 <= entry["size"] <= MAX_ENTRY or
                not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", "")))):
            raise ValueError("Invalid runtime member identity")


def verify_bundle(path, spec):
    validate_spec(spec)
    path = Path(path)
    if path.stat().st_size != spec["archive"]["size"] or checksum(path) != spec["archive"]["sha256"]:
        raise ValueError("Runtime input archive checksum or size mismatch")
    with zipfile.ZipFile(path) as archive:
        for info in checked_infos(archive, spec):
            expected = spec["entries"][info.filename]
            with archive.open(info) as source:
                actual = hashlib.file_digest(source, "sha256").hexdigest()
            if actual != expected["sha256"]:
                raise ValueError("Runtime input member checksum mismatch")


def checked_infos(archive, spec):
    infos = archive.infolist()
    names = [entry.filename for entry in infos]
    if len(names) != len(set(names)) or set(names) != set(spec["entries"]):
        raise ValueError("Runtime input archive entry set mismatch")
    for info in infos:
        mode = info.external_attr >> 16
        if (info.is_dir() or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or
                info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
            raise ValueError("Runtime input must be an ordinary file")
        if info.file_size != spec["entries"][info.filename]["size"]:
            raise ValueError("Runtime input member size mismatch")
    return infos


class HTTPSOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        if urllib.parse.urlsplit(url).scheme != "https":
            raise ValueError("Runtime download requires HTTPS")
        return super().redirect_request(request, response, code, message, headers, url)


def download_bundle(url, destination, expected_size):
    opener = urllib.request.build_opener(HTTPSOnly())
    with opener.open(url, timeout=45) as response, Path(destination).open("wb") as output:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > expected_size:
                raise ValueError("Runtime download exceeds its pinned size")
            output.write(chunk)
        if total != expected_size:
            raise ValueError("Runtime download was incomplete")


def ensure_bundle(path, spec, download=None):
    validate_spec(spec)
    path = Path(path)
    if path.exists():
        verify_bundle(path, spec)
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".runtime-inputs-", dir=path.parent) as directory:
        temporary = Path(directory) / "download.zip"
        (download or download_bundle)(spec["archive"]["url"], temporary, spec["archive"]["size"])
        verify_bundle(temporary, spec)
        if path.exists():
            verify_bundle(path, spec)
        else:
            os.replace(temporary, path)
    return path


def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def install_bundle(path, source, lyrics_cache, spec):
    # Verify every member before changing either existing input tree.
    verify_bundle(path, spec)
    source, lyrics_cache = Path(source), Path(lyrics_cache)
    lyrics_cache.parent.mkdir(parents=True, exist_ok=True)
    if lyrics_cache.is_symlink():
        raise ValueError("Runtime cache must be an ordinary directory")
    with tempfile.TemporaryDirectory(prefix=".lyrics-inputs-", dir=lyrics_cache.parent) as temporary:
        staged = Path(temporary) / "current"
        with zipfile.ZipFile(path) as archive:
            # Bind installation to the bytes actually extracted, even if the
            # public cache pathname changed after initial archive verification.
            node = None
            for info in checked_infos(archive, spec):
                name = info.filename
                payload = archive.read(info)
                expected = spec["entries"][name]
                if len(payload) != expected["size"] or hashlib.sha256(payload).hexdigest() != expected["sha256"]:
                    raise ValueError("Extracted runtime member checksum or size mismatch")
                if name.startswith("lyrics/"):
                    target = staged / "dist" / name.removeprefix("lyrics/")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(payload)
                elif name == NODE:
                    node = payload
            shutil.copyfile(staged / "dist/LICENSE", staged / "LICENSE")
        previous = Path(temporary) / "previous"
        if lyrics_cache.exists():
            os.replace(lyrics_cache, previous)
        try:
            os.replace(staged, lyrics_cache)
            atomic_write(source / "app/libnode/bin/arm64-v8a/libnode.so", node)
        except OSError:
            if lyrics_cache.exists():
                shutil.rmtree(lyrics_cache)
            if previous.exists():
                os.replace(previous, lyrics_cache)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".api2-cache/runtime-inputs/runtime-inputs.zip"))
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    spec = load_spec(args.manifest)
    ensure_bundle(args.output, spec)
    print("Verified retained runtime bundle " + spec["archive"]["sha256"])


if __name__ == "__main__":
    main()
