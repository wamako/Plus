#!/usr/bin/env python3
"""Validate packaged module DEX files before an APK is distributed."""
import argparse
import hashlib
import struct
import zipfile
import zlib


class InvalidDex(ValueError):
    pass


def defined_classes(data):
    string_count, string_offset = struct.unpack_from("<II", data, 56)
    type_count, type_offset = struct.unpack_from("<II", data, 64)
    class_count, class_offset = struct.unpack_from("<II", data, 96)
    for count, offset, width in ((string_count, string_offset, 4),
                                  (type_count, type_offset, 4),
                                  (class_count, class_offset, 32)):
        if offset + count * width > len(data):
            raise InvalidDex("DEX table extends beyond the file")

    def string(index):
        if index >= string_count:
            raise InvalidDex("Invalid string index")
        offset = struct.unpack_from("<I", data, string_offset + index * 4)[0]
        # Skip the ULEB128 UTF-16 length before decoding the class descriptor.
        for _ in range(5):
            if offset >= len(data):
                raise InvalidDex("Truncated DEX string")
            byte = data[offset]
            offset += 1
            if not byte & 0x80:
                break
        else:
            raise InvalidDex("Invalid string length")
        try:
            end = data.index(0, offset)
        except ValueError as error:
            raise InvalidDex("Unterminated DEX string") from error
        return data[offset:end].decode("utf-8")

    result = set()
    for index in range(class_count):
        type_index = struct.unpack_from("<I", data, class_offset + index * 32)[0]
        if type_index >= type_count:
            raise InvalidDex("Invalid class type index")
        string_index = struct.unpack_from("<I", data, type_offset + type_index * 4)[0]
        result.add(string(string_index))
    return result


def validate_dex(name, data):
    if len(data) < 112 or data[:4] != b"dex\n" or data[7] != 0:
        raise InvalidDex(f"{name}: missing or truncated DEX header")
    # This app's minSdk 27 produces standalone DEX files, not v041 containers.
    if data[4:7] not in (b"035", b"037", b"038", b"039", b"040"):
        raise InvalidDex(f"{name}: unsupported standalone DEX version {data[4:7]!r}")
    file_size, header_size, endian = struct.unpack_from("<III", data, 32)
    if file_size != len(data):
        raise InvalidDex(f"{name}: actual size {len(data)} differs from header size {file_size}")
    if header_size != 112 or endian != 0x12345678:
        raise InvalidDex(f"{name}: invalid DEX header layout")
    if hashlib.sha1(data[32:]).digest() != data[12:32]:
        raise InvalidDex(f"{name}: SHA-1 signature mismatch")
    if zlib.adler32(data[12:]) & 0xFFFFFFFF != struct.unpack_from("<I", data, 8)[0]:
        raise InvalidDex(f"{name}: Adler-32 checksum mismatch")
    return defined_classes(data)


def verify_apk(path):
    classes, dex_count = set(), 0
    with zipfile.ZipFile(path) as apk:
        names = apk.namelist()
        if len(names) != len(set(names)):
            raise InvalidDex("APK contains duplicate ZIP entry names")
        if apk.testzip() is not None:
            raise InvalidDex("APK ZIP integrity check failed")
        for name in names:
            if not name.endswith(".dex") or "/" in name:
                continue
            found = validate_dex(name, apk.read(name))
            duplicates = classes & found
            if duplicates:
                raise InvalidDex(f"{name}: duplicate class definitions: {sorted(duplicates)[:3]}")
            classes.update(found)
            dex_count += 1
        if not dex_count:
            raise InvalidDex("APK has no DEX files")
        entrypoints = [line.split("#", 1)[0].strip()
                       for line in apk.read("assets/xposed_init").decode().splitlines()]
        entrypoints = [name for name in entrypoints if name]
        if not entrypoints:
            raise InvalidDex("Module has no Xposed entry points")
        for name in entrypoints:
            if "L" + name.replace(".", "/") + ";" not in classes:
                raise InvalidDex(f"Missing Xposed entry point: {name}")
    print(f"PASS: {dex_count} DEX files, {len(classes)} classes, {len(entrypoints)} Xposed entry points")
    with open(path, "rb") as source:
        print("APK SHA-256:", hashlib.file_digest(source, "sha256").hexdigest())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk")
    args = parser.parse_args()
    try:
        verify_apk(args.apk)
    except (InvalidDex, zipfile.BadZipFile, KeyError, OSError, struct.error, UnicodeError) as error:
        parser.exit(1, f"FAIL: {error}\n")
