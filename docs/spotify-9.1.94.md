# Spotify 9.1.94.1929 compatibility preview

Module version: `0.10.0-api2.9.1.94.7` (version code 24), arm64 API-2 preview.

The first preview APK is withdrawn. The supplied framework log shows Android rejecting its `classes17.dex` before either Xposed entry point loads: the file is 5,767,168 bytes while its header requires 6,984,980. Inspection of the distributed APK confirms that truncated entry; it is a partial duplicate of `classes15.dex`. APK signing verification did not detect this DEX-level problem. Revision 2 is a clean CI rebuild, with DEX integrity and entry-point checks required before artifact upload. This addresses the observed loading blocker; device feature testing is still required.

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
python3 tools/verify_module_apk.py app/build/outputs/apk/debug/app-debug.apk
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

## Preview revision 3: settings click result

Version `0.7.4-compat.9.1.94.3` (code 20) fixes the settings-entry crash captured in the revision 2 device logs. In Spotify 9.1.94, the side-drawer handler casts the two-argument click callback result to a nullable instrumentation event. Returning Kotlin Unit opens the overlay, then crashes that cast. The module callback now returns null (no native event), matching the existing concrete callback path, while context-menu callbacks retain their Unit result. A regression test exercises the caller's typed cast and verifies that the module action runs once. Device confirmation is still required.

## Revision 4: Next Up, native Bookmarks, and glass styling

Preserve the confirmed revision 3 settings callback fix. Track menu discovery now handles directly captured ContextTrack objects, the older singleton-list representation, and unambiguous URI-only captures using Spotify's own ContextTrack.create factory. Resolve queue services when Play Next is pressed, with a weak reference to Spotify's live queue repository if the callback dependency graph is deeper than expected. Successful and rejected updates now give feedback. Existing manually queued tracks retain their order: Play Next inserts at the beginning of Next up, after the explicit queue, matching the existing feature description. Swipe to Play Next remains opt-in under General settings.

The user selected native additions to preserve the working legacy runtime, rather than migrating to API 2. New drawer entries:

- **Bookmarks**: save a song, album, or artist from its supported context menu; alternatively paste its Spotify link. Filter saved items, view counts, open them in Spotify, reorder, delete, and undo deletion. Data is saved in Spotify's private preferences and survives module replacement. A failed save preserves the previous list. Ambiguous or multi-item menus do not guess which item to bookmark. Artwork is read from menu track metadata when available.
- **Liquid Glass**: optional static translucent gradients and edge highlights on exposed native headers/toolbars, mini-player/navigation, menu/drawer surfaces, and cards/settings rows. Choose categories and intensity; switch off to restore original backgrounds and padding. Compose-only surfaces retain Spotify's rendering. This is native styling, not the API-2 add-on's full-screen replacements or a pixel-identical port. No backdrop blur is applied to text/content.

Reference projects reviewed and attributed: [LeNerd46/bookmarks](https://github.com/LeNerd46/bookmarks), source revision `d2bd903e9082cba77252e276003585539ffa3d2d`, and [LeNerd46/liquid-glass-spotify-plus](https://github.com/LeNerd46/liquid-glass-spotify-plus), source revision `fb6908dadd2b6a059c4a83517b4643e20596bb8b`. Their API-2 scripts are not executed by this legacy build; these Java features implement the selected compatible alternative. Their original code and debug token logging are not bundled.

Regression coverage: bookmarks persistence, URI deduplication/filtering, normalization, reorder/remove/undo, failed writes, captured track shapes and cyclic graphs, ambiguous menu URIs, and glass target selection. APK packaging validation still checks every DEX and both Xposed entry points. Runtime queue operations, native surface availability and menus require on-device verification.

## Revision 5: playback history and the API-2 extension host

The queue request was clarified as **previously played history**, rather than another Play Next change. Add persistent Recently played history from real player-state transitions. Ignore paused/browsed tracks and repeated snapshots; preserve the pending song across process restarts and cap local history at 100 entries. When local history is empty, import Spotify's own previous-track snapshot if available. Open Recently played from the drawer or the history button beside Queue in the custom Now Playing controls.

Following the user's explicit selection to upgrade to API 2, retain the proven legacy Xposed entry points, settings adapter, Bookmarks and optional native glass styling while adding the real upstream Node extension host, native renderer, worklet engine and SDK. This arm64 build uses Node 18.20.4 from the published upstream APK, verified by SHA-256, and compiles the JNI bridge from the pinned upstream modern-api source. The build prepares the actual Marketplace and Extension settings scripts, with extension installation, update and removal support. Permanent drawer slots open Marketplace, Extension settings, and an Extensions page listing dynamically registered extension pages, avoiding dependence on Spotify rebuilding a cached drawer after installation. It seeds the requested Beautiful Lyrics add-on once into the normal installed-extension directory; subsequent uninstall/update decisions are retained. The old legacy lyrics activity interception is disabled when API 2 is enabled so it cannot close the extension's lyrics page.

Compatibility adapters use the existing 9.1.94 drawer/menu discovery, named lyrics/Now Playing activities, runtime optional-value classes, Spotify's Android media session for player controls and the captured native queue repository. API-2 targets are advertised only for the implemented Now Playing and lyrics adapters. Other extensions may require additional Spotify service/target adapters; a functioning host does not establish compatibility with every marketplace extension.

Sources: upstream runtime `LeNerd46/SpotifyPlus@615455bf0a7a81cd2d01382a1f1e9e0a699fb082`; Node binary donor `v0.10-preview-1`, APK SHA-256 `d94cabfe0f6fdeb07a81da60030bf8e63eab4c3a5339bc99fcda81028788cf48`; [Beautiful Lyrics](https://github.com/LeNerd46/beautiful-lyrics-spotify-plus) at `6e60d0a038149c2df72664275d35beb2916cafd1`, including its MIT license. Generated dependencies and binary assets are excluded from Git and recreated by `tools/prepare_api2.py` using these pins. The distribution manifest's `dist/index.js` path is normalized to its actual bundled `index.js` location. Marketplace metadata loading awaits cache reads, fixing an upstream Promise-to-JSON parsing error caught by its tests.

Validation must include the upstream runtime, UI, native-installer and marketplace suites, local history regression tests, CMake/Android build, packaged DEX and native/extension asset checks. This is a larger experimental migration and must be verified on the reported Android 17 / LSPatch phone before merging.

## Revision 6: artwork and glass

- Glass preferences use explicit large ON/OFF buttons, avoiding Spotify's theme shrinking platform switches. Settings scroll and respect system bar insets.
- Observe resumed activities and refresh native surfaces as views are created or rebound. Target the confirmed `navigation_bar` and `now_playing_bar_layout` IDs, not their anchors/inset spacers. Navigation uses inset pill geometry, a sampled frosted backdrop and a brighter rim. This is native surface styling; Compose content is not replaced.
- Normalize Spotify image URIs, raw IDs and HTTPS artwork without inserting a stock album or double-prefixing image URLs. Fall back from large artwork to image_url.
- Feed animated theme backgrounds from the named PlayerState builder on 9.1.94, retaining the older Rx adapter.
- Attach animated cover tracking before player state is ready. Keep the static cover visible until the first video frame, and on errors, track changes and release. Use album/artist-matched motion lookup shared with immersive artwork instead of the first song search result. Motion art remains dependent on a matching provider asset.

Device verification under LSPatch is still required for glass appearance, artwork playback and API-2 surfaces.

## Revision 7: extension startup under LSPatch

Both libnode.so and libnative-lib.so declare libc++_shared.so as a required ELF dependency. R6 attempted to load Node before C++, and loaded C++ only later through the renderer. Load C++ first, then Node, then JNI. This removes reliance on the host app's library search path. Failed extension launchers now expose a copyable startup stage and root exception instead of a generic restart toast. The device's exact original failure has not been captured; validate R7 on-device and use those details for any remaining blocker.
