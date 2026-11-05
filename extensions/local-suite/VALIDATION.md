# Validation record · 0.1.1

Validated in the build workspace on 2026-11-05.

- **48 core/regression tests passed**: link validation, both playlist schemas, stable sorting,
  unknown values, deduplication, genre matching, shuffle, CSV escaping, listening
  qualification, pauses/seeks/buffering, retention, cancellation, cache bounds,
  network allowlist and token separation, timeout/rate-limit behavior, pagination,
  native read fallback, Last.fm fallbacks, missing provider counts, confirmation,
  new-copy-only writes, batch boundaries, partial/uncertain outcomes and queue caps. New regression cases cover native album and playlist reads, multi-disc
  order, duplicate occurrences, artist ID recovery, native genre data, all-Web-404
  behavior, missing labels, Last.fm not-found fallback, cancellation, truncated
  playlists, rate limits, and waiting for in-flight workers after a read failure.
- **TypeScript check passed** against the exact pinned R10 SDK declarations.
- **Four API-2 bundles built** using the SDK's official transformed extension builder.
- **Two actual host-loader/React-renderer integration tests passed**: all four bundles
  loaded as unprivileged user extensions with unique registrations; no HTTP on
  install; local tracking opt-in; collection preview; stale confirmation
  invalidation; confirmed new private copy and ordered queue append through mocked
  service responses; current-track genre lookup and directory details; multi-genre
  preview; independent unload; stale callback rejection; Android Back callback;
  registration/listener/cleanup removal. One scenario supplies public read responses;
  the other supplies actual raw native metadata shapes and makes every public Web
  API GET return 404. The native album/genre scenario completes without a public
  Web API GET. Spotify writes remain mocked, permission-dependent Web API calls.
- Android-native service operations and HTTP responses are mocked in the host
  integration test. No test was run on a physical phone, live Spotify account,
  Android emulator or live LSPatch session. Native layout, live authorization,
  background survival and private Java bridge behavior need device acceptance.

Runtime SDK pin: `LeNerd46/SpotifyPlus@615455bf0a7a81cd2d01382a1f1e9e0a699fb082`.
Target module: R10 / Spotify 9.1.94.1929 / API 2, Android arm64.
The R10 APK, its native hooks and existing extension bundles were not modified.

Reproduce with `npm run check` after the pinned SDK setup in README.md.
