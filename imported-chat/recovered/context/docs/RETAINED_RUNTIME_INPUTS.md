# Retained runtime inputs

Normal builds use `tools/runtime-inputs.json` and the versioned
[`build-inputs-r11-v1` prerelease](https://github.com/wamako/Plus/releases/tag/build-inputs-r11-v1).
They do not require an expiring historical Actions artifact or an authenticated
GitHub download. `.api2-cache/runtime-inputs` is only a download optimization.

The bundle preserves the exact ARM64 Node 18.20.4 binary and Beautiful Lyrics
payload from R11. All host Java, C++ and JavaScript still build from pinned source.
The archive contains no Spotify application APK or account data. Full Node and
project notices are included, alongside the original Lyrics files and notices.

The manifest pins both the archive and every member by SHA-256 and size. A corrupt
existing cache fails rather than falling back to unverified data. Downloads stage
in a temporary directory and activate only after full verification. Installation
rejects duplicate, extra, missing, traversal and nonregular ZIP entries, validates
every member before replacing inputs, checks the actually extracted bytes again,
and preserves other Node ABIs. A failed Node activation restores the previous
Lyrics tree. These are build-time failure protections, not a two-filesystem
power-loss transaction.

## Clean build and recovery

Run `python3 tools/prepare_api2.py`. It downloads the retained bundle when absent.
For an offline copy, use `--binary-inputs /path/runtime-inputs-r11-v1.zip`; the same
verification applies. To recover a corrupt cache, remove that cache file and
repeat the build. Do not disable digest verification.

The original R11 Actions artifact was used once to seed the retained release.
Recovery from a separately retained, exact R11 APK remains available through
`--runtime-apk`. Its SHA-256 must be
`176aac1fec257cf18b7f2fc002f5cad2be2f9cc774a69694094e34555abb5df2`.
`tools/package_runtime_inputs.py` reproduces the minimal bundle and manifest from
that APK. Do not replace an existing published asset: changed inputs require a
new release asset/version, reviewed manifest, matching headers and validation.

Bundle SHA-256:
`d43b7b250bf7cd1fca0f66000d21f4c6e1d64780bf5a59d80df7b4a997065c4a`.
Size: 100,588,604 bytes; 46 verified files. Provenance is recorded in the manifest
and release notes. Keep a separate backup of this bundle for disaster recovery;
retention removes Actions expiry, not the possibility of a deleted release.
