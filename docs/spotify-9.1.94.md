# Spotify 9.1.94.1929 compatibility preview

Module version: `0.7.4-compat.9.1.94` (version code 18).

Target package: `com.spotify.music`, version `9.1.94.1929`, build `147600575`.

The supplied APK's SHA-256 is
`a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304`.

## Changes

- Discover the settings row from its title resource and follow the content/row constructors to the coroutine that returns the drawer's row list. Clone the native Settings row into that list. Retain the array callback path used by earlier versions.
- Support the modern context menu's enum style and interface callback. Use Spotify's own Kotlin Unit and callback interface, with identity-based Object methods. Keep the concrete-lambda adapter for earlier versions.
- Capture authorization and client-token headers from request-builder methods that are no longer final after R8 class merging. Discover the optional ad filter's URL writer semantically instead of assuming the removed `okhttp3.Request$Builder` name. Header values are never logged.
- Support the coroutine `SetPrivateSession` RPC with a fresh continuation per refresh and native state observation. Retain the older Rx settings adapter. Coalesce refresh requests so frequent state reads cannot postpone a pending refresh.
- Support both argument orders of Spotify's playback preference writer when temporarily disabling crossfade for lyric syncing.
- Build with Java 21 in GitHub Actions; test and produce an installable debug APK on pull requests without release signing secrets. Signed releases remain restricted to main-branch pushes with signing configured.

Obfuscated names are discovered at runtime rather than embedded as a version-specific mapping.

## Verification

Build and unit tests:

```sh
bash gradlew testDebugUnitTest assembleDebug
```

Check the core hook signatures against your own copy of the target APK:

```sh
python -m pip install androguard==4.1.4
python tools/verify_spotify_apk.py /path/to/spotify.apk
```

The checker verifies the settings factory/row/list-builder chain, modern menu and callback shapes, header writers, coroutine private-session setter/context, playback preference service, and lyrics renderer. It does not ship or upload Spotify's APK or decompiled code. These are static checks, not evidence that every feature works on a device.

Validation on November 4, 2026: debug assembly and all three unit tests passed. The core APK signature checks passed, including the new drawer list builder. An additional lint run reported 11 errors on statements already present in the starting commit (10 older-Android API checks and one existing custom-view inheritance issue); lint is not clean for this repository. No phone or emulator runtime tests were performed.

## On-device testing

1. Install the debug module APK, enable its Spotify scope in LSPosed or LSPatch, and force-stop/reopen Spotify. This APK uses a development signing key; an existing module signed with another key must be uninstalled first. Spotify Plus preferences are stored inside Spotify, so keep Spotify installed.
2. Open the account drawer. Check that Spotify Plus Settings appears once and opens, and that native Settings still works.
3. Play a track. Check full-screen lyrics, inline lyrics, seeking, pause/resume, and track changes. Open the track menu and test the custom lyrics and Last.fm rows.
4. Enable persistent private session. Check Spotify's actual private-session state, restart Spotify, and verify refresh through the native six-hour expiry. Turn the module preference off and confirm native controls can disable private session again.
5. Check lyric syncing/crossfade restoration, the heart button, Play Next, sleep timer, themes, and animated artwork on the device.

If a feature fails, export an LSPosed/LSPatch log after reproducing it and include the Android version and feature preference. Device runtime testing and the long-duration private-session expiry check remain outstanding for this preview.
