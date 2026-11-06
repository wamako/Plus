# Spotify Plus project checkpoint

Updated 2026-11-06. This is the continuity record for future work. Read it with
`spotify-9.1.94.md`, `API2_STORAGE_R11.md`, `API2_PLAYLIST_R12.md` and the local
extension README/validation record. Do not treat earlier milestones as current
limitations when a later repair supersedes them.

## User's installation and working baseline

- Repository: https://github.com/wamako/Plus
- Spotify **9.1.94.1929**, APK version code **147600575**.
- Non-rooted Samsung **SM-S928U**, Android **17 / API 37**, **arm64-v8a**.
- LSPatch **1.2 (487)**, Xposed API **102**, Vector
  **canary-3106 (7306), e00c5c5038bbcc14e0b382ab893301d6993e6989**.
- Current delivered module: **R12**, version
  `0.10.0-api2.9.1.94.12`, module version code **29**.
- Current delivered local extension suite: **0.1.7**, API **2**.
- User reports the result is looking good so far and will test further. **Do not
  claim the R12 live playlist save or all features have passed device acceptance.**
- User is testing R12 now. A request to investigate another extension is not a
  request to replace that tested baseline or upgrade Spotify/the entire runtime.

## Delivered artifacts and source

- `SpotifyPlus-9.1.94.1929-api2-r12-arm64.apk`:
  SHA-256 `8eba1eeae1d86861d6dc1c728a0d9ef98a202dcf5d6bdcfcfae5e1fec7771814`.
  Library identity `libfile_0f3bc659ca0c8191b84b3495b8654346`, version **11**.
- `SpotifyPlus-Local-Extensions-0.1.7.zip`:
  SHA-256 `78fb081f3e09a6762f339b682ecf0f77f04d3ced794422b362798b65de3ef5d7`.
  Library identity `libfile_793721010b34819196727f0c12dacc16`, version **9**.
- APK executable source: `18c294766995bcc9bdf4be2ac8a66f55c72224ab` on
  `codex/local-extensions`. Subsequent `56d6358` changes README wording only.
- Successful Android workflow **42249323815**, artifact **13520135582**.
  Artifact ZIP SHA-256:
  `ed6ecc76cba5a4fa891bf1f0d4c55683bbeb6de7b1403e53e25098794a96e742`.
- Draft PRs: `/pull/1` (Spotify compatibility), `/pull/2` (local extensions/R12).
  Neither was merged. Do not merge without the user's landing approval.

## Features and preferences to preserve

1. Settings entry/startup fixes for Spotify 9.1.94 and LSPatch. The user initially
   saw no Plus settings, then a crash on opening them; later reported success.
2. Play Next resolves the captured native queue repository semantically, keeps
   manually queued entries in order, and inserts at the start of Next up.
3. **Previously played songs belong inside the native Queue sheet**, above
   current/upcoming songs, not in a separate Recently played menu. Persistent
   history is bounded to 100 and can import the native previous-track snapshot.
   Native upcoming rows, Edit/reordering and footer controls remain available.
4. Native Bookmarks: save songs/albums/artists, filter, reorder, delete/undo,
   persist and open in Spotify. Category/action pills must have readable full
   labels; use intrinsic widths with horizontal scrolling.
5. Liquid Glass is optional with working category/intensity controls and
   restoration on disable. Shared profile/category header backdrop must avoid a
   seam. Home filters must remain below the status/cutout inset. Bottom navigation
   is an inset rounded floating pill above the system navigation area. User
   supplied a translucent YouTube navigation pill as the style reference.
6. Animated backgrounds and artwork: normalize Spotify image identifiers, attach
   to current player state, keep static covers until motion starts and on errors,
   and require matching provider artwork rather than unrelated search results.
7. Beautiful Lyrics is bundled with the real API-2 Node host, Marketplace,
   extension settings and dynamic extension pages. Other marketplace extensions
   are not automatically compatible just because the host runs.
8. Custom sleep timers: preserve preset settings, minute/hour and one-time
   amounts, add saved amounts to the player's native timer menu, keep built-in
   durations/end-of-track/cancel actions, and avoid competing native/custom timers.
9. Local extensions are preferred where practical; the user does not need to
   publish them to Marketplace. Preserve unique IDs and existing private state.

## Local adaptations delivered

Four independent Android adaptations, not drop-in desktop scripts:

- Listening Stats (`com.wamako.listeningstats`), based on
  https://github.com/HeadshotInteractive/listening-stats
- Sort Play (`com.wamako.sortplay`), based on https://github.com/hoeci/sort-play
- What's That Genre? (`com.wamako.genres`), based on
  https://github.com/LucasOe/spicetify-genres
- Playlist Plus (`com.wamako.playlistplus`), based on
  https://github.com/paramkathir/spotify-playlist-plus

Important recovered behavior:

- Mobile-session public Web API calls can return **404**. Prefer implemented
  native/context/raw-metadata reads; do not assume another public API endpoint
  fixes mobile authorization. Do not supply third-party Spotify tokens.
- Liked Songs uses its dedicated collection/context readers, supports complete
  reads up to **100,000** entries, keeps URI membership when catalog metadata is
  unavailable, and rejects incomplete membership instead of using partial data.
- A new playlist copy is limited to **10,000 tracks** per explicit range and
  saves in ordered, acknowledged batches of **100**. Queue append is capped at
  **100** per explicit confirmation. Source likes/playlists are never rewritten.
- Native fetch requires its own AbortSignal. R10's sandbox may not expose
  AbortController; omit the signal there and retain the caller deadline.
- Save settings from the latest native text draft, validate, write and read back.
  Last.fm keys are masked. Each extension has its own key/username settings.
  Saving local settings does not establish that a provider accepts credentials.
- Last.fm **503** keeps the saved key and uses remaining enabled genre providers
  with a one-minute failure cooldown. Optional MusicBrainz is initially off and
  rate-spaced; absent data remains Unknown. Ranking failures remain visible.
- **R11** restored the missing production API-2 StorageHook and registration;
  JS-only changes cannot repair missing host storage. Never regress this wiring.
- **R12** replaces stale native playlist builder aliases and creation enum names
  with a writer based on stable schema fields. It validates request/response
  classes before sending and awaits each server result. Bridge error stages are
  fixed codes for input/schema/client preparation, RPC, acknowledgment, rejection.
- Preserve confirmed counts/new-copy URI and uncertainty after failed writes.
  Never auto-retry uncertain writes or switch transports after a mutation.
  Existing journals remain visible warnings, not an automatic retry mechanism.
- Use **Preview native Spotify copy** for the R12 path. **Preview Web API copy**
  remains separate and may still return 404. Inspect earlier empty/partial copies
  before manually repeating an uncertain action.

## Runtime/build constraints

The upstream migrated to https://gitlab.com/LeNerd46/spotify-plus. Keep runtime
source/SDK pinned to **615455bf0a7a81cd2d01382a1f1e9e0a699fb082**; do not replace
the host wholesale with today's upstream. Old GitHub release/lyrics downloads
are unavailable. R11 is the verified binary donor for unchanged Node 18.20.4 and
Beautiful Lyrics. Its hashes and artifact/cache retention constraints are in
`API2_PLAYLIST_R12.md`. All host Java/C++/JS is rebuilt.

Android 17 rejected writable extracted native code. Retain the atomic read-only
writer and dependency order **libc++_shared.so -> libnode.so -> libnative-lib.so**.
R12 downloaded APK checks confirmed unchanged Node and all bundled Lyrics bytes.

R12 checks passed: 10 Python/JVM checks (production storage and playlist classes),
100 JS regressions, TypeScript, four bundles in eight pinned host-loader/renderer
profiles, upstream runtime/marketplace suites, Android unit tests/build and APK
DEX/native assets. Mocks/offline APK inspection are not live phone verification.

## Current next request: Shuffle+

User asks whether **Spicetify Shuffle+** can be adapted for this build. Main
reference is `spicetify/cli/Extensions/shuffle+.js`; rxri's **FeatureShuffle** is
only an optional reference and is a different, audio-feature-based recommender.
See `SHUFFLE_PLUS_FEASIBILITY.md` for inspected code, API gaps and implementation
boundaries. No Shuffle+ extension or new APK has been delivered at this checkpoint.
