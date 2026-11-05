# Validation record · 0.1.0

Validated in the build workspace on 2026-11-05.

- **29 core tests passed**: link validation, both playlist schemas, stable sorting,
  unknown values, deduplication, genre matching, shuffle, CSV escaping, listening
  qualification, pauses/seeks/buffering, retention, cancellation, cache bounds,
  network allowlist and token separation, timeout/rate-limit behavior, pagination,
  native read fallback, Last.fm fallbacks, missing provider counts, confirmation,
  new-copy-only writes, batch boundaries, partial/uncertain outcomes and queue caps.
- **TypeScript check passed** against the exact pinned R10 SDK declarations.
- **Four API-2 bundles built** using the SDK's official transformed extension builder.
- **Actual host-loader/React-renderer integration test passed**: all four bundles
  loaded as unprivileged user extensions with unique registrations; no HTTP on
  install; local tracking opt-in; collection preview; stale confirmation
  invalidation; confirmed new private copy and ordered queue append through mocked
  service responses; current-track genre lookup and directory details; multi-genre
  preview; independent unload; stale callback rejection; Android Back callback;
  registration/listener/cleanup removal.
- Android-native service operations and HTTP responses are mocked in the host
  integration test. No test was run on a physical phone, live Spotify account,
  Android emulator or live LSPatch session. Native layout, live authorization,
  background survival and private Java bridge behavior need device acceptance.

Runtime SDK pin: `LeNerd46/SpotifyPlus@615455bf0a7a81cd2d01382a1f1e9e0a699fb082`.
Target module: R10 / Spotify 9.1.94.1929 / API 2, Android arm64.
The R10 APK, its native hooks and existing extension bundles were not modified.

Reproduce with `npm run check` after the pinned SDK setup in README.md.
