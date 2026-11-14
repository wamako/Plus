import unittest
from verify_api2_assets import validate_api_advertisement


class ApiAdvertisementTests(unittest.TestCase):
    def test_packaged_loader_and_public_api_must_agree(self):
        sdk = b'version: script_manifest_1.CURRENT_SCRIPT_API,'
        manifest = b'exports.CURRENT_SCRIPT_API = 2;'
        validate_api_advertisement(sdk, manifest)
        with self.assertRaisesRegex(AssertionError, 'loader constant'):
            validate_api_advertisement(b'version: 1,', manifest)
        with self.assertRaisesRegex(AssertionError, 'support API 2'):
            validate_api_advertisement(sdk, b'exports.CURRENT_SCRIPT_API = 1;')
