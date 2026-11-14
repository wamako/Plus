"""Prove an APK contains the addon produced by its own build variant."""
import argparse
from pathlib import Path
import zipfile


def verify(build, apk, variant, abi):
    if variant not in ('debug', 'release') or abi not in ('arm64-v8a', 'x86_64'):
        raise ValueError('Unknown addon build profile')
    outputs = list((build / 'intermediates/cmake' / variant).glob(f'**/obj/{abi}/libspotifyplus_bridge.so'))
    if len(outputs) != 1:
        raise ValueError(f'Expected one {variant} compiled addon, found {len(outputs)}')
    with zipfile.ZipFile(apk) as archive:
        packaged = archive.read(f'assets/nodejs/addons/{abi}/spotifyplus_bridge.node')
    if not packaged or packaged != outputs[0].read_bytes():
        raise ValueError(f'Packaged addon differs from {variant} native output')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--build', type=Path, default=Path('app/build'))
    parser.add_argument('--variant', choices=['debug', 'release'], required=True)
    parser.add_argument('--abi', choices=['arm64-v8a', 'x86_64'], default='arm64-v8a')
    args = parser.parse_args()
    verify(args.build, args.apk, args.variant, args.abi)
    print(f'Verified {args.variant}/{args.abi} packaged addon against its compiled output')
