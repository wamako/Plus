import hashlib
import struct
import unittest
import zlib

from verify_module_apk import InvalidDex, validate_dex


def dex_fixture():
    data = bytearray(112)
    data[:8] = b"dex\n038\0"
    struct.pack_into("<III", data, 32, len(data), 112, 0x12345678)
    data[12:32] = hashlib.sha1(data[32:]).digest()
    struct.pack_into("<I", data, 8, zlib.adler32(data[12:]) & 0xFFFFFFFF)
    return data


class ModuleDexIntegrityTest(unittest.TestCase):
    def test_structurally_valid_header(self):
        self.assertEqual(set(), validate_dex("classes.dex", dex_fixture()))

    def test_truncation_rejected_before_signature(self):
        data = dex_fixture()
        struct.pack_into("<I", data, 32, 6984980)
        with self.assertRaisesRegex(InvalidDex, "actual size .* differs from header size 6984980"):
            validate_dex("classes17.dex", data)

    def test_bad_signature_rejected(self):
        data = dex_fixture()
        data[44] ^= 1
        with self.assertRaisesRegex(InvalidDex, "SHA-1 signature mismatch"):
            validate_dex("classes.dex", data)

    def test_bad_checksum_rejected(self):
        data = dex_fixture()
        data[8] ^= 1
        with self.assertRaisesRegex(InvalidDex, "Adler-32 checksum mismatch"):
            validate_dex("classes.dex", data)
