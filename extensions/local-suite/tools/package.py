"""Package the tested extension bytes in reproducible, versioned phone ZIPs."""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = json.loads((ROOT.parents[1] / "build-versions.json").read_text())
FOLDERS = ("listening-stats", "sort-play", "genres", "playlist-plus")


def payloads(parent, folders, expected=None, documents=()):
    versions, identities = set(), set()
    for folder in folders:
        directory = parent / folder
        manifest = json.loads((directory / "manifest.json").read_text())
        version = manifest["version"]
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise ValueError("Invalid extension version")
        if (manifest["api"] != 2 or manifest["main"] != "index.js" or
                manifest.get("native") or manifest["id"] in identities or
                (directory / "index.js").stat().st_size >= 300_000):
            raise ValueError("Invalid local extension payload")
        identities.add(manifest["id"])
        versions.add(version)
    if len(versions) != 1 or (expected is not None and versions != {expected}):
        raise ValueError("Mixed or stale extension versions")
    files = {}
    for name in documents:
        path = parent / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Required extension notice is missing")
        files[name] = path.read_bytes()
    for folder in folders:
        directory = parent / folder
        if directory.is_symlink():
            raise ValueError("Extension symlinks are not supported")
        for path in sorted(directory.rglob("*")):
            if path.is_symlink():
                raise ValueError("Extension symlinks are not supported")
            if path.is_file():
                files[path.relative_to(parent).as_posix()] = path.read_bytes()
    files["SHA256SUMS.txt"] = ("".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items())
    )).encode()
    return versions.pop(), files


def package(name, prefix, files):
    output = ROOT / "artifacts" / name
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
        staged = Path(temporary) / name
        with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(prefix + name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data, compresslevel=9)
        with zipfile.ZipFile(staged) as archive:
            if archive.testzip() is not None or any(archive.read(prefix + name) != data for name, data in files.items()):
                raise ValueError("Extension archive verification failed")
        staged.replace(output)
    print(f"{output.name}: {output.stat().st_size} bytes, SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    # Validate both products before emitting any installable ZIP.
    suite_version, suite = payloads(ROOT / "build/SpotifyPlus-Local-Extensions", FOLDERS,
                                    VERSIONS["suiteVersion"],
                                    ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "VALIDATION.md"))
    shuffle_version, shuffle = payloads(ROOT / "build/SpotifyPlus-ShufflePlus", ("shuffle-plus",), VERSIONS["shuffleVersion"])
    package(f"SpotifyPlus-Local-Extensions-{suite_version}.zip", "SpotifyPlus-Local-Extensions/", suite)
    package(f"SpotifyPlus-ShufflePlus-{shuffle_version}.zip", "", shuffle)
