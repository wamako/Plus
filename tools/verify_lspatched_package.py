#!/usr/bin/env python3
"""Check an LSPatch output's contents. This does not run Android or Spotify.

Manifest inspection requires androguard==4.1.4. Signature verification is a
separate step using VerifyLspatchSignature.java and the verified patcher JAR.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import zipfile
import zlib

CORE = "e00c5c5038bbcc14e0b382ab893301d6993e6989"
JAR_SHA = "d238fdc414d121b7fa454d8b4ccf420df3a8c97d563761861ff92bd9c5da2165"
MODULE_SHA = "97efb28001c7e05b052c29a4d63ed6186d5b12fccf8ff1ed9bd4d37d5aaaafe7"

def digest(stream):
    return hashlib.file_digest(stream, "sha256").hexdigest()

def manifest(path):
    from loguru import logger
    logger.disable("androguard")
    from androguard.core.apk import APK
    apk = APK(str(path))
    application = apk.get_android_manifest_xml().find("application")
    return {
        "package": apk.get_package(), "version": apk.get_androidversion_name(),
        "version_code": apk.get_androidversion_code(), "min_sdk": apk.get_min_sdk_version(),
        "target_sdk": apk.get_target_sdk_version(),
        "component_factory": application.get("{http://schemas.android.com/apk/res/android}appComponentFactory"),
    }

def verify_origin(output, patched, original, expected_hash):
    """LSPatch links host entries inside a stored origin.apk (intentional overlap).

    Python's ZipFile refuses to open that enclosing entry. Read only its bounded
    stored bytes, checking its local header, size, CRC and full original hash.
    Other entries still go through ZipFile's overlap/CRC checks.
    """
    entry = output.getinfo("assets/lspatch/origin.apk")
    assert entry.compress_type == zipfile.ZIP_STORED and entry.flag_bits == 0
    assert entry.file_size == entry.compress_size == original.stat().st_size
    with patched.open("rb") as stream:
        stream.seek(entry.header_offset)
        header = struct.unpack("<4s5H3I2H", stream.read(30))
        assert header[0] == b"PK\x03\x04" and header[2:4] == (0, 0)
        assert header[6:9] == (entry.CRC, entry.file_size, entry.file_size)
        assert stream.read(header[9]) == entry.filename.encode()
        stream.seek(header[10], 1)
        assert stream.tell() + entry.file_size <= output.start_dir
        remaining, crc, sha = entry.file_size, 0, hashlib.sha256()
        while remaining:
            chunk = stream.read(min(1024 * 1024, remaining))
            assert chunk, "Truncated embedded original"
            sha.update(chunk)
            crc = zlib.crc32(chunk, crc)
            remaining -= len(chunk)
        assert crc == entry.CRC, "Embedded original CRC mismatch"
        assert sha.hexdigest() == expected_hash, "Embedded original APK changed"

def validate_module_identity(info, abi):
    assert abi in ("arm64-v8a", "x86_64"), "Unsupported module ABI"
    assert info["package"] == "com.lenerd46.spotifyplus"
    suffix = "-emulator-x86_64" if abi == "x86_64" else ""
    expected = {"0.10.0-api2.9.1.94.13"+suffix,"0.10.0-api2.9.1.94.14"+suffix,"0.10.0-api2.9.1.94.15"+suffix,"0.10.0-api2.9.1.94.16"+suffix}
    assert info["version"] in expected, "Module version does not match its explicit ABI profile"

def validate_signature_mode(config, expected):
    assert expected in (0, 2), "Unsupported explicit signature mode"
    assert type(config.get("sigBypassLevel")) is int and config["sigBypassLevel"] == expected, "Different patch options from this test"

def verify(original, module, jar, patched, expected_module_sha=MODULE_SHA, module_abi="arm64-v8a", signature_bypass_level=0):
    with original.open("rb") as f: original_hash = digest(f)
    with module.open("rb") as f: module_hash = digest(f)
    with jar.open("rb") as f: jar_hash = digest(f)
    assert module_hash == expected_module_sha, "Unexpected module input checksum"
    assert jar_hash == JAR_SHA, "Expected official LSPatch 1.2 (487) release JAR"
    original_manifest, patched_manifest, module_manifest = map(manifest, [original, patched, module])
    for value in [original_manifest, patched_manifest]:
        assert value["package"] == "com.spotify.music"
        assert value["version"] == "9.1.94.1929" and value["version_code"] == "147600575"
        assert value["target_sdk"] == "37", "Unexpected host target SDK"
    assert patched_manifest["min_sdk"] == "28", "LSPatch's minimum Android version differs"
    assert patched_manifest["component_factory"] == "org.lsposed.lspatch.metaloader.LSPAppComponentFactoryStub"
    validate_module_identity(module_manifest, module_abi)
    with zipfile.ZipFile(module) as package:
        for path in ("lib/" + module_abi + "/libnode.so", "lib/" + module_abi + "/libnative-lib.so",
                     "assets/nodejs/addons/" + module_abi + "/spotifyplus_bridge.node"):
            data = package.read(path)
            assert data[:6] == b"\x7fELF\x02\x01" and struct.unpack_from("<H", data, 18)[0] == (183 if module_abi == "arm64-v8a" else 62), "Module native ABI does not match its profile"
    with zipfile.ZipFile(patched) as output, zipfile.ZipFile(jar) as patcher:
        assert len(output.namelist()) == len(set(output.namelist())), "Duplicate ZIP names"
        verify_origin(output, patched, original, original_hash)
        for entry in output.infolist():
            if entry.filename != "assets/lspatch/origin.apk":
                with output.open(entry) as stream:
                    while stream.read(1024 * 1024):
                        pass  # ZipFile validates overlap, truncation and CRC.
        config = json.loads(output.read("assets/lspatch/config.json"))
        version = config["lspConfig"]
        assert version["VERSION_NAME"] == "1.2" and version["VERSION_CODE"] == 487
        assert version["API_CODE"] == 102
        assert version["CORE_VERSION_CODE"] == 7306 and version["CORE_VERSION_NAME"] == "canary-3106"
        assert version["CORE_VERSION_HASH"] == CORE
        assert config["useManager"] is False and config["injectDex"] is False
        validate_signature_mode(config, signature_bypass_level)
        assert config["appComponentFactory"] == original_manifest["component_factory"]
        with output.open("assets/lspatch/modules/com.lenerd46.spotifyplus.apk") as f:
            assert digest(f) == module_hash, "Embedded module changed"
        loader = "assets/lspatch/loader.dex"
        assert output.read(loader) == patcher.read(loader), "Loader does not match tested patcher"
        for abi, machine in (("arm64-v8a", 183), ("x86_64", 62)):
            native = "assets/lspatch/so/" + abi + "/liblspatch.so"
            binary = output.read(native)
            assert binary == patcher.read(native), "Framework does not match tested patcher"
            assert binary[:6] == b"\x7fELF\x02\x01" and struct.unpack_from("<H", binary, 18)[0] == machine
    with patched.open("rb") as f: patched_hash = digest(f)
    return {
        "test_kind": "offline_lspatch_packaging", "passed": True,
        "patcher_sha256": jar_hash, "original_sha256": original_hash,
        "module_sha256": module_hash, "patched_sha256": patched_hash,
        "original_manifest": original_manifest, "patched_manifest": patched_manifest,
        "module_manifest": module_manifest, "framework": version,
        "patch_mode": "integrated", "signature_bypass_level": config["sigBypassLevel"],
        "embedded_original_unchanged": True, "embedded_module_unchanged": True,
        "loader_and_arm64_framework_match_patcher": True,
        "framework_abis_verified": ["arm64-v8a", "x86_64"], "module_abi": module_abi,
        "runtime_test_executed": False,
        "runtime_test_limitation": "No Android emulator or device was used; launch, login, native library loading and Shuffle+ playback were not exercised.",
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["original", "module", "jar", "patched"]:
        parser.add_argument("--" + name, required=True, type=pathlib.Path)
    parser.add_argument("--module-sha256", default=MODULE_SHA,
                        help="Expected input artifact hash; defaults to delivered R13")
    parser.add_argument("--module-abi", choices=("arm64-v8a", "x86_64"), default="arm64-v8a")
    parser.add_argument("--signature-bypass-level", type=int, choices=(0, 2), default=0)
    args = parser.parse_args()
    print(json.dumps(verify(args.original, args.module, args.jar, args.patched, args.module_sha256, args.module_abi, args.signature_bypass_level), indent=2))
