# R25: API advertisement and selected runtime backports

Compared our R24 head `92c144215a78dfdb7305113bed7ff8b27078d988` with GitLab
main `49d0a665def1f73862c774aff4815d7ed4d4b375`, retrieved November 10, 2026:
https://gitlab.com/LeNerd46/spotify-plus/-/tree/49d0a665def1f73862c774aff4815d7ed4d4b375
The changes after our selected `c407383` release snapshot only remove two Markdown
files. The Marketplace script itself is already present through R15's backport.
We retain its multi-manifest catalog, README and release-note rendering, source
provenance, update checks, Original Spotify Plus collection and compatibility badges.

## Confirmed API warning cause

The retained loader accepts transformed API 2 bundles (`CURRENT_SCRIPT_API = 2`),
but its ScriptApiFactory still returned `version: 1`. Marketplace reads that
public value, producing the user's exact warning even for a supported bundle.
R25 uses `CURRENT_SCRIPT_API` like current upstream. It does not change the
manifest admission policy, worklet transform, or native bridge protocol. API 1
compatibility bundles still load; API 3 is still rejected. Marketplace's future
API warning now correctly tells users to update before installation, matching
this host's rejection policy rather than upstream's inactive-install policy.
About shows live Extension API and running Spotify version alongside module version.
Shuffle/LikedSongs protocol `version: 1` values are separate and remain unchanged.

## Selected additions

- Upstream's script scheduler tracks timeouts, intervals, immediates and
  microtasks, reports synchronous throws and rejected promises, and disposes
  callbacks on unload/failed initialization. This protects the shared JS runtime
  from these callback failures, not from arbitrary untrusted extension code.
- Upstream's animated image view starts GIF/WebP drawables only while attached
  and visible, stopping them on hide, replacement and detachment. We backport the
  focused image-loading method instead of replacing the native renderer. Decoding
  retains a static API 27 fallback; API 28+ uses ImageDecoder. Inputs are capped at
  16 MiB and decoded dimensions are sampled to at most 2048 pixels per side.
  SVG support is not imported; it requires a separate renderer compatibility review.
- SDK preparation now stages on its destination filesystem, fixing an observed
  EXDEV failure when /tmp and the checkout are on different volumes.

The selected scheduler and image view are kept with upstream's MIT license in
`tools/backports/r25`; the adapted image decoder is documented there. Production
and local-SDK preparation both apply `tools/apply_runtime_improvements.py`.

## Deliberately retained

No wholesale upstream app/SDK replacement: the new theme/Compose inspector,
native plugin and animation/worklet contracts require separate Android 9.1.94
qualification. Node 18.20.4 and Beautiful Lyrics binary inputs are unchanged.
Keep Android 17 sealed native extraction, native playlist writer, typed storage,
manual fork update links, extension trust notices, custom timers, bookmarks,
Liquid Glass and all playback verification/journals. Autoplay is unchanged.
The R24 10,000-track order mismatch and phone DNS error are not fixed by this work.
Suite 0.1.12 and Shuffle+ 0.1.14 update the R25 host pairing, not playback algorithms.

## Evidence and limits

The initial regression executed the real R24 API factory and Marketplace code:
API 2 was accepted by the manifest parser but Marketplace warned 'supports API 1'.
New regression checks cover API 1/2 acceptance, API 3 rejection, retained Spotify
range warnings and live About values. Scheduler tests exercise both direct
callbacks and actual loader unload/failed initialization with another script alive.
The APK verifier checks the compiled public API refers to the loader constant.
The CI probe requires the live patched Spotify host to report API 2 on both starts.
Two added Android tests exercise real animated decoding/lifecycle and bounded
invalid input, alongside the previous ten native-model/rendering/navigation tests.
Final CI results and exact artifact hashes are recorded in PR2 after validation.
Logged-out emulator checks do not establish authenticated playback or Samsung rendering.
