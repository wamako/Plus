# Validation record · 0.1.4

Validated in the build workspace on 2026-11-05.

- **72 core/regression tests passed**: link validation, both playlist schemas, stable sorting,
  unknown values, deduplication, genre matching, shuffle, CSV escaping, listening
  qualification, pauses/seeks/buffering, retention, cancellation, cache bounds,
  network allowlist and token separation, timeout/rate-limit behavior, pagination,
  native read fallback, Last.fm fallbacks, missing provider counts, confirmation,
  new-copy-only writes, batch boundaries, partial/uncertain outcomes and queue caps. New regression cases cover native album and playlist reads, multi-disc
  order, duplicate occurrences, artist ID recovery, native genre data, all-Web-404
  behavior, missing labels, Last.fm not-found fallback, cancellation, truncated
  playlists, rate limits, and waiting for in-flight workers after a read failure.
- New saved-track regression cases cover collection URI recognition, exact protobuf
  request bytes, UTF-8/wire parsing, paginated liked entries, saved-album/removal
  exclusion, saved timestamps, empty collections, 101-track Web API pagination,
  context page chaining/preloaded pages, cursor/snapshot failures, cancellation,
  account fallback, credential host restrictions, rate limits and read-only POST
  error classification, plus retained saved URIs when catalog metadata is unavailable.
- **TypeScript check passed** against the exact pinned R10 SDK declarations.
- **Four API-2 bundles built** using the SDK's official transformed extension builder.
- **Six actual host-loader/React-renderer integration tests passed**: all four bundles
  loaded as unprivileged user extensions with unique registrations; no HTTP on
  install; local tracking opt-in; collection preview; stale confirmation
  invalidation; confirmed new private copy and ordered queue append through mocked
  service responses; current-track genre lookup and directory details; multi-genre
  preview; independent unload; stale callback rejection; Android Back callback;
  registration/listener/cleanup removal. One scenario supplies public read responses;
  a second supplies actual raw native metadata shapes and makes every public Web
  API GET return 404. The native album/genre scenario completes without a public
  Web API GET. Spotify writes remain mocked, permission-dependent Web API calls. A third scenario clicks **Load Liked Songs** in both Sort Play
  and Playlist Plus, supplies two binary saved-collection pages for each, and
  verifies the full liked preview and genre filtering without playlist/Web GETs.
- Large-library regression cases reproduce the old 10,001-track error, then
  verify a complete 10,001-track context read with zero per-track bridge calls,
  traversal of 501 context pages, and rejection above the new 100,000-track guard.
  Collection parser cases cover optional sync tokens, signed timestamps and
  skipped unknown uint64 fields. The cache keeps its existing persisted format
  while using bounded Map storage for large classifications.
- A sixth actual-loader profile reads **20,001 mocked context tracks across three
  pages**, sorts them, renders only 40 preview rows, selects range 10,001–20,000,
  checks its explicit confirmation, and verifies a new private playlist plus
  exactly 100 ordered write batches of 100 tracks. Reading/sorting/range selection
  makes no write request; saving retains the full 20,001-track preview. This is a
  host-renderer test with mocked Spotify responses, not a live account test.
- **Startup regression reproduced before the fix**: the 0.1.2 bundle failed in the
  actual pinned loader when the injected decoder rejected the `fatal` option
  with `ERR_NO_ICU`, before its page could register. The corrected build registers
  and renders all four extensions under both that restriction and a profile with
  the optional encoder/decoder exports absent; both also run the Liked Songs flow.
  These profiles emulate runtime capabilities, not a physical Android binary.
- UTF-8 regression cases cover non-ASCII text, supplementary characters, literal
  U+FFFD and rejected overlong/surrogate/truncated encodings. Strict validation is
  preserved without an ICU-dependent codec.
- Android-native service operations and HTTP responses are mocked in the host
  integration test. No test was run on a physical phone, live Spotify account,
  Android emulator or live LSPatch session. Native layout, live authorization,
  background survival and private Java bridge behavior need device acceptance.

Runtime SDK pin: `LeNerd46/SpotifyPlus@615455bf0a7a81cd2d01382a1f1e9e0a699fb082`.
Target module: R10 / Spotify 9.1.94.1929 / API 2, Android arm64.
The R10 APK, its native hooks and existing extension bundles were not modified.

Reproduce with `npm run check` after the pinned SDK setup in README.md.
