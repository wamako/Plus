"""Create a deterministic local-loader ZIP and verify all four payloads."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
parent = root / 'build' / 'SpotifyPlus-Local-Extensions'
folders = ['listening-stats', 'sort-play', 'genres', 'playlist-plus']
ids = set()
for folder in folders:
    manifest = json.loads((parent / folder / 'manifest.json').read_text())
    assert manifest['api'] == 2 and manifest['main'] == 'index.js'
    assert not manifest.get('native')
    assert manifest['id'] not in ids
    ids.add(manifest['id'])
    assert (parent / folder / 'index.js').stat().st_size < 300_000
(root / 'artifacts').mkdir(exist_ok=True)
output = root / 'artifacts' / 'SpotifyPlus-Local-Extensions-0.1.1.zip'
paths = sorted(p for p in parent.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt')
sums = '\n'.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(parent).as_posix()}' for p in paths) + '\n'
(parent / 'SHA256SUMS.txt').write_text(sums)
paths.append(parent / 'SHA256SUMS.txt')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(paths):
        info = zipfile.ZipInfo(file.relative_to(parent.parent).as_posix(), (2026, 11, 5, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(f'SpotifyPlus-Local-Extensions/{folder}/manifest.json' in archive.namelist() for folder in folders)
print(f'{output}\n{output.stat().st_size} bytes\nSHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}')
