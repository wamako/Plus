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
- Current delivered module: **R13**, version
  `0.10.0-api2.9.1.94.13`, module version code **30**.
- Current delivered local extension suite: **0.1.7**, API **2**, plus separate
  **Shuffle+ 0.1.0** (`com.wamako.shuffleplus`).
- User reported R12 was looking good so far and would test further. **Do not
  claim R12 or the new R13 passed full physical device acceptance.**
- The user explicitly approved building Shuffle+ after feasibility research. R13
  is the additive update for it; Spotify and the runtime source pin stay unchanged.

## Delivered artifacts and source

- Current R13 APK: `SpotifyPlus-9.1.94.1929-api2-r13-arm64.apk`, SHA-256
  `97efb28001c7e05b052c29a4d63ed6186d5b12fccf8ff1ed9bd4d37d5aaaafe7`.
  Library identity `libfile_0f3bc659ca0c8191b84b3495b8654346`, version **12**.
- Shuffle+ ZIP: `SpotifyPlus-ShufflePlus-0.1.0.zip`, SHA-256
  `a775322a3e9d9fefaf51a1ce2b12f0a07971a418d56b3542fed033edbff1ce45`.
  Library identity `libfile_ef80c890d7208191a3a86fe4bc56a194`, initial version **0**.
- R13 executable source: `5687f27d2956a5c224dcf55611fd1bea0bd902cf`.
  Successful workflow **42263057174**, APK artifact **13526306251**, Shuffle+
  artifact **13525503134**. APK artifact ZIP SHA-256:
  `a0a1c0debd3355225ffc72f1161644157678fa4df256cb46e719ac30e4dc9908`.
- The following R12 records describe the previous version, retained in history:

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
boundaries. No Shuffle+ extension or new APK had been delivered at the feasibility checkpoint.

### Approved implementation: R13 / Shuffle+ 0.1.0

The user then explicitly asked to proceed. Implemented a separate local
`com.wamako.shuffleplus` extension, native queue/Play adapter, bounded single-use
previews, additive SDK ShufflePlus namespace and uncertainty journal/review flow.
See `API2_SHUFFLE_R13.md` and `extensions/local-suite/SHUFFLE_PLUS.md` for complete
behavior and installation. The existing four 0.1.7 scripts/manifests remain
byte-identical; keep their installed folders. R13 is needed for the new adapter.
The R12 artifact identity keeps version history when the current module is
replaced. Production JVM/native glue/protocol, 106 JS regressions, TypeScript and
nine actual host-loader/renderer profiles passed locally. Android CI/package
verification and live device acceptance must be distinguished from these checks.

R13 delivery completed: Android CI, all packaged class/native checks and local
manifest/version checks passed. The actual APK contains the asynchronous Shuffle+
SDK namespace, not the legacy request route. Node and all bundled Beautiful
Lyrics bytes match R11; the original four 0.1.7 bundles/manifests match the prior
ZIP. A later documentation/verifier-only commit does not change APK executable
source. No on-phone R13 result has been reported yet.

### LSPatch packaging and Android CI validation

User supplied `wamako/apkpatch` and updated `wamako/android-ci-template`, then
authorized adapting the workflow in this project. Exact delivered R13 passed a
real offline integrated patch using official LSPatch 1.2/487, Xposed API 102 and
the phone's Vector canary-3106/7306/e00c5c5 commit. Embedded original/module and
loader/framework checks passed; APK v2 signature verified with zero errors.
Spotify target 37 was preserved; LSPatch raises min SDK to 28. CLI signature
bypass 0 was tested; the phone's full patch options are unknown.

`docs/LSPATCH_VALIDATION.md` and its JSON record describe the evidence. The
adapted reusable workflow runs after existing pinned runtime preparation and
build/regressions. Its API37 ARM64 AVD harness installs actual patched Spotify,
loads Shuffle+ through the production loader, checks two starts and native
read-only code. It uses an ARM host, not macos-14's Intel host. Root ADB is only
for disposable fixture setup/inspection, with ADB unrooted before launches.

Device execution requires repository secret SPOTIFY_APK_URL and enable variable
RUN_LSPATCH_SMOKE=true (or the manual checkbox after default-branch availability).
These are not configured through the available connector. Skipped/setup-failed
device jobs must never be described as runtime passes. No authenticated playback,
real queue order, extension UI clicks or Samsung firmware checks were performed.
No delivered APK/ZIP executable content was changed by this CI/tooling work.

The official stable SDK platform/image package is **android-37.0**, not
android-37. The workflow installs official macOS ARM64 SDK tools 23.0/build
16111833, uses that exact Google APIs image and checks the running guest's API
integer 37/ARM64. A separate environment-only invocation runs without Spotify
or credentials; it must not be called a patched-app startup test. Patched-host
execution remains gated on the original APK source/enable flag.

GitHub's hosted ARM Macs do not support nested virtualization. The default
environment probe records unsupported_runner/passed:null with no Android boot,
not a green runtime result. Actual testing also needs ANDROID37_RUNNER_LABEL
selecting a trusted ephemeral physical ARM Mac with usable HVF. Custom-runner
jobs exclude fork PRs. The preflight runs `emulator -accel-check` and records
that result separately from the documented hosted-runner limitation.

User subsequently reported enabling patched-Spotify testing and asked us to
handle runner setup where possible. Added a bounded hosted ARM software-emulation
trial using Google's documented ANDROID_I_WANT_MY_TCG=yes/-accel off opt-in.
It is enabled by the existing RUN_LSPATCH_SMOKE flag/manual checkbox, uses the
same exact Android 37.0 ARM64 image, and reports its mode separately. Each boot
has a 15-minute deadline; no APK-source secret is needed for the environment
trial. Only that optional experiment can be inconclusive without failing the
build; boot-result.json still records failure and prevents patched-host testing.
Actual requested startup checks remain strict. Configuration-presence booleans
are reported by CI; settings cannot be inspected directly through the connector.
Software compatibility and any resulting patched-app test must be verified in
CI; do not infer success from the new execution plan or capability probe.

The first software trial at 029fe4a8 reached the new execution plan, confirming
the user's enable flag, but failed an obsolete SDK CLI text-format check before
booting. Replaced that check with stable-image/API/ABI/channel validation of
Google's XML inventory and verified it against the actual inventory. Also
separated the enabled lspatch-packaging job so the user's configured APK source,
embedded bytes and signature can be checked without waiting for a guest boot.
Only JSON reports are uploaded. R13 app/extension executable source is unchanged.
