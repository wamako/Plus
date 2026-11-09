# Spotify Plus · Spotify 9.1.94.1929 compatibility build

This fork adapts Spotify Plus and local Android extensions for non-root LSPatch.
The current candidate is **R23**, with **Shuffle+ 0.1.12** and the four-extension
suite **0.1.10**. [build-versions.json](build-versions.json) defines build identity.

| Component | Supported profile |
| --- | --- |
| Spotify | 9.1.94.1929, version code 147600575 |
| Phone module | ARM64, 0.10.0-api2.9.1.94.23, code 40 |
| Target phone | Samsung SM-S928U, Android 17 / API 37 |
| Loading | Non-root LSPatch 1.2 (487), Vector canary 3106 |
| Emulator checks | Linux API 37 x86_64, separate emulator-only module |

## Install or update

1. Keep your Spotify app data. Repatch the original matching Spotify APK with
   the ARM64 module in LSPatch. The module APK alone is not a Spotify installer.
2. Replace the unpacked `shuffle-plus` folder with Shuffle+ 0.1.12. Update the
   four local extension folders with suite 0.1.10 when using those apps.
3. Refresh the local extensions folder and restart Spotify. Verify the version
   under Spotify Plus settings → About and Shuffle+'s active adapter.
4. Follow [phone acceptance](R23_ACCEPTANCE.md) before relying on playback or
   library writes. Inspect any unknown write outcome before a new attempt.

Extensions execute inside Spotify and must be fully trusted. Read
[the extension trust model](SECURITY.md) before loading downloaded code.

## Changes and verification

[R23 changes and remaining limits](docs/API2_R23_STABILIZATION.md) describe the
queue revision fix, verified journals, variant-specific native addons, update
links and reduced idle glass work. Automated checks do not prove authenticated
Samsung playback works; the phone acceptance step remains.

CI restores checksum-pinned runtime inputs, builds clean Release and mixed
Debug/Release, runs native/JavaScript/UI tests, and checks patched Spotify startup
in the configured emulator. See [build inputs](docs/RETAINED_RUNTIME_INPUTS.md)
and [the workflow](.github/workflows/android.yml). No Mac is required.

## Credits and history

Based on [LeNerd46/spotify-plus](https://gitlab.com/LeNerd46/spotify-plus) under its
MIT license. Beautiful Lyrics and the original extension authors retain their
credits/licenses in the packages. The [original README](docs/UPSTREAM_README.md)
describes upstream features; [the checkpoint](docs/PROJECT_CHECKPOINT.md)
records this fork's history.
