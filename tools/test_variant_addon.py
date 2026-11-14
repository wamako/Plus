from pathlib import Path
import tempfile
import unittest
import zipfile
from verify_variant_addon import verify


class AddonVariantTests(unittest.TestCase):
    def test_mixed_builds_require_the_matching_variant_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for variant in ('debug', 'release'):
                native = root / f'intermediates/cmake/{variant}/obj/arm64-v8a/libspotifyplus_bridge.so'
                native.parent.mkdir(parents=True)
                native.write_bytes(variant.encode())
                apk = root / f'{variant}.apk'
                with zipfile.ZipFile(apk, 'w') as archive:
                    archive.writestr('assets/nodejs/addons/arm64-v8a/spotifyplus_bridge.node', variant.encode())
            for variant in ('debug', 'release'):
                apk = root / f'{variant}.apk'
                verify(root, apk, variant, 'arm64-v8a')
                with self.assertRaisesRegex(ValueError, 'differs'):
                    verify(root, apk, 'release' if variant == 'debug' else 'debug', 'arm64-v8a')

    def test_ambiguous_native_outputs_fail_instead_of_picking_one(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('first', 'second'):
                native = root / f'intermediates/cmake/debug/{name}/obj/x86_64/libspotifyplus_bridge.so'
                native.parent.mkdir(parents=True)
                native.write_bytes(b'addon')
            with self.assertRaisesRegex(ValueError, 'found 2'):
                verify(root, root / 'unused.apk', 'debug', 'x86_64')
