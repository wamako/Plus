# Validation record · 0.1.9 / R22

Test-first cases cover native Liked Songs credential confinement, JSON/binary
paging, redacted failures, endpoint/account checks, redirects, response limits
and the real SDK facade. Queue entries retain pinned factory identity; the real
Android helper comparison is required. See [R22 evidence and limits](../../docs/API2_R22_COLLECTION_READS.md).
Final CI/head and exact file hashes are recorded in PR2 after validation. Live
Samsung account, queue order and library acceptance remain a phone step.

## Earlier 0.1.8 / R21 validation


2026-11-09: test-first changes for silent journal storage failures, large artist
shuffle and retained binary inputs. Local checks passed: 140 extension regressions
(including 27 journal fault cases and three shuffle compatibility/scale cases),
TypeScript, transformed builds, 14 actual-loader profiles and four CI storage
probe profiles. The rebuilt pinned host passed 71 core, 15 UI, six native and
34 marketplace tests. Final CI evidence is recorded in PR2 after validation.

Journal cases cover thrown/dropped/stale/malformed read-back at initial, progress
and completion checkpoints across native/Web playlist creation and queue append,
confirmed-count/new-copy URI retention even if failure recording fails, privacy,
healthy batches and no retries. Artist shuffle matches the previous algorithm
for 30 seeded cases, preserves duplicate occurrences/input, bounds metadata reads
and handles 100,000 occurrences. Timing samples are workspace observations, not
phone responsiveness guarantees.

The CI-only Android probe runs journal verification through real native Storage
and shuffles 100,000 tracks on embedded Node18. Both feature markers are required
from the launched app process alongside the correct storage phase. Reload must
verify persisted data before writing and clean its own namespace. Probe files
are excluded from phone ZIPs. Authenticated writes remain mocked in automated
extension tests; live Samsung account/playback/queue acceptance remains a phone
step. Storage read-back is not a power-loss durability guarantee.

## Earlier 0.1.7 / R12 validation


2026-11-06: production Java writer tested on the JVM with renamed protocol
fixtures and a native-client/Rx adapter. Tests check exact Unicode request bytes,
creation origin, root/playlist request fields, duplicate/order preservation,
validation before dispatch, ambiguous/unavailable clients, explicit rejection,
lost RPC, malformed and incomplete acknowledgments. Schema names, field numbers,
ClientBase.callSingle signature and protobuf parseFrom signature were inspected
in the supplied Spotify 9.1.94.1929 APK. These checks do not execute a live Spotify
write. JavaScript regressions cover failed create/add stages, retained confirmed
counts/new-copy URI, and no retry or alternate transport after a failure.

The following records describe earlier regression coverage retained by this build.

## Earlier 0.1.6 validation

Validated in the build workspace on 2026-11-05.

- **98 core/regression tests passed**: link validation, both playlist schemas, stable sorting,
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
- **Eight actual host-loader/React-renderer integration tests passed**: all four bundles
  loaded as unprivileged user extensions with unique registrations; no HTTP on
  install; local tracking opt-in; collection preview; stale confirmation
  invalidation; confirmed new private copy and ordered queue append through mocked
  service responses; current-track genre lookup and directory details; multi-genre
  preview; independent unload; stale callback rejection; Android Back callback;
  registration/listener/cleanup removal. One scenario supplies public read responses;
  a second supplies actual raw native metadata shapes and makes every public Web
  API GET return 404. The native album/genre scenario completes without a public
  Web API GET. Spotify writes remain mocked, with transport-specific permission/bridge requirements. A third scenario clicks **Load Liked Songs** in both Sort Play
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
- Real native Node fetch **reproduced a failure before the network fix**:
  `RequestInit: Expected signal to be an instance of AbortSignal` for the bundled
  polyfill signal. The fixed helper succeeds with real fetch against a local
  data response. Every host integration request now passes native Request
  construction to enforce that brand check even when service responses are mocked.
- The seventh actual-loader profile exercises R10's user sandbox with no exposed
  AbortController, real fetch-backed data responses, a failing track bridge,
  raw-track recovery, a retained unreadable liked URI, a complete 3-song preview,
  explicitly confirmed native create/add operations, and opt-in MusicBrainz lookup.
  Playlist Plus still shows all three songs with no active genre filter even when
  all their genres are unknown. Native write acknowledgments are mocked, not live.
- New core cases cover raw track/artist fallback, metadata failures without lost
  membership, rate-limit propagation, controlled network/JSON diagnostics, real
  fetch compatibility, awaited native batches and partial unknown outcomes,
  MusicBrainz identity/URL checks, ambiguous matches, spacing, caching, no default
  provider traffic and token separation. Native visibility is explicitly described
  as Spotify's default rather than promising a private playlist.
- Settings regression **reproduced on 0.1.5 before the fix**: a native text event
  followed immediately by the existing Save button stored the previous empty
  username. The eighth actual-host profile now verifies same-frame username/key
  saves, explicit feedback, extension unload/reload persistence, blank automatic
  account lookup, simulated storage exceptions, silently dropped writes, invalid
  key handling without overwriting the saved value, and separate extension storage.
  It also saves Listening Stats provider fields through the real native text-event
  path and checks retained credentials after a mocked ranking HTTP 503.
- New core cases cover storage read-back, malformed legacy values, key/account
  validation, Last.fm 503 fallback to Spotify or enabled MusicBrainz, retained
  Unknown rows, a bounded failure count across 100 tracks, changed-key recovery,
  authentication feedback, preserved rate-limit/cancellation behavior, direct
  ranking errors and exclusion of temporary warnings from successful cache entries.
  The host profile confirms successful Playlist Plus classification during a
  mocked Last.fm 503 and verifies that the saved keys are not cleared or printed.
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
Target module: R11 / Spotify 9.1.94.1929 / API 2, Android arm64.
The extension scripts remain unchanged from 0.1.6. The R11 APK separately adds
native storage registration. The earlier host mocks supplied working storage and
did not detect R10's omitted Android handler. R11 adds a production-handler JVM
regression and a packaged DEX class requirement; physical phone verification is
still needed.

Reproduce with `npm run check` after the pinned SDK setup in README.md.
