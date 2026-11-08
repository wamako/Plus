# Spotify Plus project checkpoint

## Shuffle+ 0.1.1 confirmation repair

The user reported that collection inputs loaded but Prepare shuffled playback
appeared to do nothing. The actual pinned loader reproduced a confirmation
hidden below forty song cards. Version 0.1.1 changes Prepare into Start shuffled
playback in the same control position and puts confirmation, progress, errors,
uncertain-outcome review and results above the track preview. Preparation stays
read-only; only the explicit Start action dispatches playback. No native protocol,
phone APK, shared UI, other extension or storage-journal behavior changed.

The expanded production-loader test uses a 10,000-song collection, verifies the
actual start button precedes track cards, preparation makes no mutation, start
sends one command, errors/results remain visible, and a delayed prepare displays
progress with the control disabled. Cancellation, stale/lost acknowledgments and
unload checks remain. Local npm check passed all 106 regressions, TypeScript,
bundle builds and nine pinned loader/renderer profiles. The original layout
failed the new long-list confirmation check before the fix. This does not claim
authenticated phone playback acceptance; the user must test the updated bundle.

Delivered ZIP: SpotifyPlus-ShufflePlus-0.1.1.zip, 26,355 bytes, SHA-256
cd9cf0b649ebced7347503e636c816fba0caf807cf00dbd04ae8718fb89c3ee0.
It updates the existing Shuffle+ deliverable. Replace only the shuffle-plus
folder, refresh Developer local extensions and restart Spotify.
Existing R13 users do not need to repatch. The four-extension suite stays 0.1.7.

## Android storage validation follow-up

The normal current-source workflow now builds a separate CI-only storage probe
and requires its write/read-back marker on launch one and persisted-read/cleanup
marker on launch two. The second launch must use a distinct app process. The
fixture tests typed preferences, private text/JSON/binary files, cache and
removals through the production API-2 SDK/loader/native bridge, without a Spotify
account or playback. It never enters a phone deliverable. See the new storage
section in LSPATCH_VALIDATION.md and inspect the current run's startup.json:
storage_persistence_verified must be true, with both phase verdicts. Earlier
green runs below predate this gate. Native settings clicks, authenticated
playback/queue and Samsung firmware/layout acceptance remain separate.

## Current Linux validation state

The default is Ubuntu24.04/KVM, API37 Google x86_64, native x86_64 module,
signature mode2,4 guest vCPUs and4096MiB requested RAM. Actual guest capacity and
package/background/broadcast idle barriers are required; ordinary app ANR
deadlines and every production-readiness/crash/native/stability check remain
enforced. No phone hook behavior/artifact changes.

Two independent fresh-AVD samples at6b15a70ac446484750312282307489b80d42b030,
run42328262741/jobs128268598111 and128268598185, each passed two launches of the
previously failing dfdf fixture (source run42325870725). Both verified4 CPUs,
3912MiB usable RAM, all idle checks, Node/Shuffle+ readiness,15s stability per
launch, native mappings and read-only code. Safe Material theme symbol observed
on all four launches: p.ksg0.a(p.s1h,p.l0m0,p.gy51,p.iyf1,p.xth,p.dqj,int).
This is a code location for future performance investigation, not a new hook.

Current-source full build run42328262786 passed75 Python/JVM checks,106 extension
regressions,nine loader profiles, TypeScript, Android unit/build and packaged
DEX/native checks. Its standard startup job128270778839 passed both launches of
the same-run rebuilt module with actual4 CPUs/3912MiB, idle barriers, all readiness
markers,15s stability per start, native mappings and read-only code. The full
workflow succeeded, with optional diagnostics explicitly skipped. Combined with
the fixture samples, six launches passed across three fresh AVDs. Normal CI always
rebuilds current artifacts. The temporary immutable-fixture workflow is removed
so expired historical artifacts cannot break it.

Small2vCPU/3072MiB native x86/mode2 initially passed but subsequent fresh runs
559b51b/42325636007 anddfdf6d3/42325870725 failed with ANR. All1754 module ZIP
entries matched exactly across passing/failing builds (run42327643657,
job128266544299). The ANR main thread was inside DexKitBridge.nativeFindMethod
from ThemeHook.findMaterialThemeMethod/hookMaterial3Palette during application
binding. Do not call the old small-guest profile reliable. Resource/idle changes
were tested together; no exact underlying native deadlock mechanism is proven.

ARM translation/mode0/API35 are explicit opt-in diagnostics, retaining their
historical2CPU/3072MiB capacity. Failures remain failures with no continue-on-error.
The source secret and RUN_LSPATCH_SMOKE flag already work. No Mac, runner label
or another URL is needed. Phone ARM/Samsung, account/playback/queue/UI acceptance
remains separate. Use LSPATCH_VALIDATION.md for current instructions; subsequent
older checkpoint paragraphs are history.


Updated 2026-11-07 (UTC). This is the continuity record for future work. Read it with
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
  **Shuffle+ 0.1.1** (`com.wamako.shuffleplus`).
- User reported R12 was looking good so far and would test further. **Do not
  claim R12 or the new R13 passed full physical device acceptance.**
- The user explicitly approved building Shuffle+ after feasibility research. R13
  is the additive update for it; Spotify and the runtime source pin stay unchanged.

## Delivered artifacts and source

- Current R13 APK: `SpotifyPlus-9.1.94.1929-api2-r13-arm64.apk`, SHA-256
  `97efb28001c7e05b052c29a4d63ed6186d5b12fccf8ff1ed9bd4d37d5aaaafe7`.
  Library identity `libfile_0f3bc659ca0c8191b84b3495b8654346`, version **12**.
- Shuffle+ ZIP: `SpotifyPlus-ShufflePlus-0.1.1.zip`, SHA-256
  `cd9cf0b649ebced7347503e636c816fba0caf807cf00dbd04ae8718fb89c3ee0`.
  Library identity `libfile_ef80c890d7208191a3a86fe4bc56a194`.
  Previous 0.1.0 ZIP SHA-256:
  `a775322a3e9d9fefaf51a1ce2b12f0a07971a418d56b3542fed033edbff1ce45`;
  retained in this file's version history (initial version 0).
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

## Shuffle+ request and approved implementation

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

CI run 42296744677 at 9be4c328 confirmed that the new XML image check passes and
started the bounded software trial. The independently enabled packaging job
downloaded the user's source but rejected its SHA-256 before patching. Presence
of both enable flag and secret was confirmed by the preceding run's summary.
Added safe input.json classification/known-Spotify version diagnostics to identify
the wrong input without reading or exposing the secret URL, and moved subsequent
environment attempts after successful package validation to avoid repeat slow
boots with invalid inputs. Do not relax the original checksum guard without
validating a replacement input. The first software trial's actual guest result
still needs to be read; starting an emulator step is not proof of a boot.

That software trial completed: native QEMU exited immediately with
HV_UNSUPPORTED/failed to initialize HVF despite -accel off and the TCG opt-in;
the wrapper waited until its boot deadline. No Android guest or patched Spotify
started. The source diagnostic at 93122088/run 42298224828 confirmed the user's
URL returns **html_page_not_apk**. The build passed, but packaging correctly
failed and later guest/startup jobs were skipped. Settings presence is correct;
the source must supply actual original APK bytes. Added an independent native
QEMU-backend probe and a guarded explicit TCG selection; actual backend results
must be read before claiming whether the hosted software route is possible.

The first standalone QEMU probe aborted with code -6 before producing accelerator
help; that is inconclusive, not proof that TCG is missing. Supply the SDK's
lib64 DYLD path and ANDROID_EMULATOR_LAUNCHER_DIR/cwd, matching the normal launcher,
and distinguish SDK-loader/probe errors from a valid backend list.

After supplying SDK loader paths the native probe returned code 2, so also
query through the binary's Android-to-QEMU argument separator. Preserve null
backend availability if both help forms are inconclusive; do not claim TCG
was absent merely because a diagnostic command failed.

The user supplied an APKMirror download-page link. Its browser-visible
`a#download-link` targets the same provider's
`/wp-content/themes/APKMirror/download.php` handler. Added bounded resolution of
that single HTTPS file anchor with a temporary cookie session, then the unchanged
original SHA-256 guard. No temporary URL keys, page content or cookies are logged
or committed. Browser download attempts did not produce a verified new file;
the actual configured CI source still must pass the new downloader. Local checks:
42 Python tests, one skipped because the prepared Java StorageHook fixture is
absent locally; workflow actionlint and whitespace checks passed. No delivered
APK or extension code changed.


## Linux workflow replacement, 2026-11-06

User has no Mac and explicitly requested another usable emulator/device. Replaced
all default Mac jobs with ubuntu-24.04/KVM and the official Android 37.0 Google
APIs x86_64 image. The image inventory confirms this exact stable package exists.
The real guest must advertise ARM64 and Google's libndk_translation bridge/ISA
mapping. The harness uses an explicit linux-x86_64-arm64-translation profile,
forces ARM64 install, checks the installed package ABI before fixture writes,
and requires the bridge mapped in Spotify during startup. Reports distinguish
translated ARM coverage from native ARM/Samsung acceptance. Original native ARM
profile remains explicit local-only; ANDROID37_RUNNER_LABEL is no longer used.
The environment job now runs independently of source/package availability.

The user's refreshed APKMirror secret was retried through the existing packaging
job. The HTTP download failed before verification; the available output withheld
status. Added fixed HTTP-status diagnostics without URLs/body/header leakage.
No challenge, provider denial or checksum is bypassed. The source and actual
patched-app test still need a successful CI run. App/extension executable source
and delivered R13/Shuffle+ artifact identities remain unchanged.
Local harness tests: 48 total, one prepared Java fixture skipped. Linux runtime
results are pending the new CI run; do not infer boot/startup from configuration.

First Linux CI run 42308987557 at 4b986376 successfully booted the official
API 37 x86_64 guest in about 42 seconds; its environment harness passed the
ARM64 bridge/ABI/ISA checks. KVM probe succeeded. The emulator action then failed
because it executes each script line separately, splitting the shell conditional.
Moved those commands into one bash file with strict error handling and an explicit
patched-host boolean. This is a wrapper failure after actual environment proof,
not a Spotify startup failure/pass. A clean job rerun is still required.

The clean Linux rerun 42309629517 at 167edd9518455f8d4635741c2d548b09740f94da
completed successfully for the environment and build. KVM was usable, the guest
booted in about 38 seconds, and actual API 37/x86_64/ARM64 native-bridge/ISA
checks passed. Environment report ZIP SHA-256:
cbd74557e053def560f394f4fd35590f165887c9b109a7abb6e3b3f4aa041d35.
Downloaded JSON confirmed passed:true, result:booted,
arm64_translation_test:true, native_arm64_test:false,
patched_host_test_executed:false. All 49 CI checks (no skips), 106 JS regressions,
loader profiles, TypeScript, Android build and DEX/native checks passed.
Packaging received HTTP 403 from APKMirror, so actual startup remained skipped.

## Google Drive APK source, 2026-11-06

User supplied a Drive sharing link. Anonymous download reached Google's standard
large-file confirmation form; following that same-file GET form produced the
exact original: 153,798,178 bytes, SHA-256 a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304.
Added bounded public Drive sharing/export/confirmation support to the CI input
downloader. The provider form must retain the original file ID and use the
fixed HTTPS Google download endpoint and known fields; duplicates, other files,
external destinations and login/permission flows are refused. No Drive link,
file ID, session UUID, cookies or APK bytes are committed/published. All existing
checksum, package and device checks remain. Local tests: 52 total, one prepared
Java fixture skipped, workflow lint/whitespace checks passed. CI still needs the
repository secret changed to the Drive link; the connector cannot edit secrets.
Local anonymous access/checksum does not establish CI access or app startup.

Drive-enabled CI run 42312473550 at f3d42a769a9bc21218d7e7f61822748ff9923260
passed all 52 checks (no skips), 106 JS regressions, build, Linux environment
and actual configured-source LSPatch packaging. Downloaded package-report ZIP
SHA-256 e934ebca3c22ddbd132fc4b80e463bd5e884eb29d824dfc76a29d89d454a3f1f
verified; original a0a6... unchanged, exact framework/API/Vector, target37,
embedded module b928315aec94817c3927668a09348b094f21f960508ca073cc9d213879c9f639,
v2 signature verified with zero errors. Source-secret delivery is working.

Initial startup job 128219038066 stopped before testing because the emulator
archive download connection closed. Retried only that job. Retry 128219431936
passed SDK/package setup, booted API37, installed the ARM64 app and provisioned
the extension, then timed out waiting for readiness on its first launch.
Downloaded startup-report ZIP SHA-256 561632088d6fe43c5ce7cd1386817294d0dd45408bc108a961004e419ff5b6ea
verified. JSON: passed:false, installed_app_abi:arm64-v8a,
patched_host_test_executed:true, launches:[], failure:readiness timeout.
No actual ready host or extension result is established; no playback/UI check.

Added fixed-field startup diagnostics (phase, process/launch marker flags,
Spotify crash presence, known exception/error categories and native-link reason
booleans), without persisting raw logs, message strings, URLs, paths or tokens.
Global logs are read only in memory to find a terminated Spotify PID; global
markers cannot satisfy a process-scoped pass. Missing process fails after 30
seconds; missing framework/module entry after 60 seconds. Verified exact Host
ready/Loaded script strings against the pinned upstream host.ts/script-loader.ts.
Local tests now 55, one prepared Java fixture skipped; Actions lint passes.
This changes only the harness/docs, not the module or extension executables.

Diagnostic run 42314895848 at 94287750b12662bb67211813fe45b64b25ed07c4 passed
55 checks (no skips), build, environment and package verification. Actual first
startup job 128226816562 reported no running process after the grace period.
Verified report ZIP SHA-256 184a3cdea35618b42f1803327558e20f3ffc64e7951673352b7b29c5ed2fb119:
stage:launch_1, installed_app_abi:arm64-v8a, loader/module markers:true,
Node/Shuffle+ markers:false, exception/error categories:[], no known Java/native
crash. A previous start PID was correlated in diagnostic logs, but the name-only
pidof lookup had not returned a single PID. This is not proof of either process
death or a naming failure, and not a successful runtime/extension test.

Replaced name-only PID detection with ActivityManager ProcessRecord identity for
the exact user-0 main app, plus `/proc/PID` existence and unique live-candidate
checks. Format verified against AOSP ProcessRecord.toShortString/toString.
Helpers/other users/invalid PIDs are excluded; no arbitrary first PID is selected.
Lookup method and counts are included in fixed-field diagnostics. Local tests:
58 total, one prepared Java fixture skipped; Actions lint and whitespace pass.
No app/extension executable code changed. A fresh CI run is required.

Run 42316531323 at 8426fa193226e508107f1978976c1b97f1db143d passed all 58
checks (no skips), build/environment/package verification. Startup job
128232707040 still reported no process. Verified report ZIP SHA-256
1060441869c7e379f343054a02ff7b5bd980ec41e0e7e58ee2c6125c7eb7c487:
loader/module markers true, Node/Shuffle+ false, no known crashes/exceptions,
ActivityManager registered_main_processes:0/live_main_processes:0. No ready
host/extension or two-start pass. This does not prove an ARM phone failure.

Added optional same-guest original-APK controls after failed patched startup:
checksum/profile verified before removing this harness's disposable test app,
original ARM64 tested for stable process/resumed activity, then original x86_64
only if ARM64 fails. Results cannot turn the failed patched verdict into a pass.
No accounts, playback or source collections are modified. Diagnostic identity
shape/resumed booleans contain no dump text. Added a separate explicit API35
(Android15) compatibility job using the same module/translation; API37 stays
separate and API35 cannot satisfy its profile. Both official stable image paths
were verified against Google's inventory. Local checks: 63 tests, one prepared
Java fixture skipped, workflow/bash/whitespace lint pass. Runtime results pending.

Read-only follow-up discovery: official nodejs-mobile v18.20.4 release includes
x86_64 libnode.so matching the runtime's Node version. Downloaded archive hash
bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af;
x86_64 library hash 9acba7e26a1e864f13b78f1b7121773643f3f33a4c6a2fe7d4f63eb06d4d3af1.
Its ARM64 library hash differs from the pinned phone donor, so no library was
replaced. An isolated native-x86 emulator build is a possible later experiment,
not implemented or validated here. Keep the delivered ARM64 runtime unchanged.

## Controlled results and native-x86 experiment

Run 42319302108 at 52a6f015b3c509247a5b8b495d4ed038031b39f4 completed build,
Linux environment and package checks. Both translated patched-host jobs failed.
Verified report ZIPs:
API35 0dd64a9d5c1109c5d7a1b44a0896db267082253fc8d15d86f5dd9466960f93b4;
API37 16ce32ea2032e8319cc16be0e8089d0dfe7c0f2707735012e88db2f4a1090252.
The original ARM64 control passed (stable 15 seconds/resumed) on both.
API35 patched app remained resumed with one live process but host_failed/
IllegalStateException; API37 patched process disappeared (registered/live 0,
no resumed activity). Both had LSPatch/module entry, no Node/Shuffle+ readiness.
The stock result validates basic process/activity detection and base-app ARM
translation. It does not prove a successful patched runtime.

Prepared an isolated native-x86 emulator variant from the same module source.
Gradle property defaults ARM64; x86 uses explicit emulator version suffix and
artifact, rebuilds JNI/addon and loads official Node 18.20.4 x86_64. The vendor
archive, ELF machine/version/hash and four identical pinned headers were checked
locally; ARM-marker preservation/negative checks passed. Official Node license
is included. The pinned patcher JAR was also downloaded/verified: both ARM64
machine183 and x86_64 machine62 framework libraries exist.

Local native-variant tests reached 67 total (one prepared Java fixture skipped),
with Actions/bash/whitespace lint passing before the final workflow separation.
The managed local environment then became unavailable during that refactor.
No local command was treated as completed afterward. GitHub stayed available;
recovered the authored changes from immutable 52a6f015 sources via API, preserving
the same guards and tests. Native build is a separate job using same-run cached
prepared source/assets, so its failure does not suppress the normal ARM build.
Explicit API inputs are validated before use. CI must validate the reconstructed
workflow and actually compile/launch x86; no native-x86 pass is claimed yet.
The delivered R13 ARM APK and Shuffle+ ZIP identities are unchanged.


Linux validation at b4276278c8240d16e5787eaa927f0653191ec82a, run 42322636521: all 67 Python/JVM checks, 106 extension regressions, nine loader profiles, Android unit/build and DEX/native verification passed. The isolated x86_64 module compiled with the pinned official matching-header Node18.20.4. Both ARM and x86 module package checks and the API37 guest passed. Patched ARM64 startup still failed on API35/37, and native x86_64 also lost its main process before Node/Shuffle+ readiness. Original ARM64 (API37) and x86_64 controls passed. API35 failure diagnostics/control were unavailable on this attempt. No phone artifacts were replaced. Current experiment adds PID-correlated ApplicationExitInfo reason/status numbers, fixed exception-frame groups, activity redirect counts and explicit signature mode 2 trials on both ABIs. Mode 0 remains separate and failed; no phone patch setting is assumed. Actual startup success is not yet established.


## Default Linux workflow after the successful comparison

Executable workflow selection: 559b51ba8fe4487e23153da061fa901d3f799abc. Native x86_64/mode2 is the normal Android17 startup job. The source secret and RUN_LSPATCH_SMOKE flag already work; do not ask for a Mac, another runner label or another source URL. Optional RUN_LSPATCH_DIAGNOSTICS/dispatch checkbox runs ARM translation and mode0 comparisons, with real failures retained. No continue-on-error is used. Default report artifacts are Environment-Android17-Native-x86-Sig2-Report, LSPatch-Package-Report and LSPatch-Android17-Native-x86-Sig2-Reports. Fresh default-path validation is run42325636007; inspect its actual outcome before claiming it passed. The earlier successful two-start evidence is run42324266946/job128258025276. The rewritten LSPATCH_VALIDATION.md is the current setup guide; older checkpoint paragraphs are historical. No phone artifact was replaced and no playback/account/queue/UI acceptance was claimed.


## Reliability follow-up

The native x86/mode2 two-launch success in run42324266946 is real, but the subsequent default-path run42325636007 at559b51b failed on its first launch with AOSP reason6 (ANR), while the stock x86 control passed. Do not call this profile reliable or the default-path rerun successful. The source/build checks passed. A temporary targeted workflow reuses the explicitly verified immutable module artifacts from run42324266946/80035647 to inspect PID-correlated main-thread ANR code identifiers without rebuilding or altering the app. Root ADB is restricted to reading that system trace after failure, and raw trace text/messages/paths are never published. The source run/commit is recorded; this is a prebuilt fixture test, not a build of the latest harness revision. The normal workflow still rebuilds all sources. No phone artifact or hook behavior has changed.


Targeted diagnostic run42326965061 at ac285b07b2c6f78af4450d0a4fb4815109678776 passed using the immutable x86/mode2 module fixture from run42324266946/80035647. Fresh default run42325870725 atdfdf6d3 failed with ANR on launch1 (stock control passed), as did559b51b/run42325636007. The same emulator37.2.13/build16740729 was used. The next targeted run uses the failing dfdf fixture and compares every APK ZIP entry against the passing800 fixture. Do not infer a binary difference or a timing root cause until the comparison/trace is available. No production hook or phone artifact was changed.


## Emulator capacity experiment

The entry comparison in run42327643657/job128266544299 found zero differences across all1754 uncompressed APK entries between the passing80035647 module and failingdfdf6d3 module. This rules out changed code/assets as the explanation; the exact runtime cause remains under investigation. The next environment-only experiment uses4 guest vCPUs and4096MiB RAM, verifies actual guest CPU/memory, and waits for Android's package/background handlers and broadcast queue after provisioning. Ordinary app ANR deadlines and every readiness/crash/stability/native check remain enforced. The temporary fixture workflow runs two independent fresh-AVD samples of the previously failingdfdf module; source run/commit and sample artifacts are explicit. Normal CI rebuilds current code. Optional historical diagnostics retain2vCPU/3072MiB. No phone code or artifacts change. Do not claim the capacity experiment succeeded before inspecting its results.

The failing dfdf fixture's ANR trace in run42327643657/job128266579393 was read successfully. Main-thread frames show DexKitBridge.nativeFindMethod inside ThemeHook.findMaterialThemeMethod/hookMaterial3Palette during Application binding, before API2 starts. This identifies the blocking scan location, not a proven deadlock mechanism. The capacity/idle experiment therefore keeps production hook behavior intact while testing whether more emulator capacity removes this startup stall. Safe diagnostics also retain the already-logged resolved Material theme member's Java identifiers when a scan completes; no raw messages or paths are returned.


## Completion record,2026-11-07 UTC

Validated executable/harness/workflow revision:6b15a70ac446484750312282307489b80d42b030.
Normal full green run:42328262786, startup job128270778839.
Independent two-sample green run:42328262741, startup jobs128268598111/128268598185.
75 Python/JVM checks,106 extension regressions,nine loader profiles, TypeScript,
Android unit/build, both ABI package/native verifiers, source/framework/signature,
actual4CPU API37 guest and two startup launches all passed. Primary startup uses
newly built artifacts; targeted samples explicitly reused dfdf artifacts. Six
successful launches across three fresh AVDs. Do not claim login/playback/queue/UI
or native ARM/Samsung acceptance. Existing source secret and RUN_LSPATCH_SMOKE are
sufficient; no Mac/additional setup required. Production hook behavior and phone
R13/extension deliverables unchanged. The following final cleanup only updates
these evidence docs and deletes the temporary lspatch-anr.yml fixture workflow;
app, build, standard workflows and harness remain exactly as validated6b15a70.
Draft PR2 remains unmerged; do not merge without user authorization.

## Shuffle+ actual queue unchanged: R14 / 0.1.2 repair (2026-11-07)

User confirms the Start control works but real playback remains in the original
order. R13 accepted an OK RPC without observing playback; its fixtures also
accepted no-op replies. R14 sends an anonymous explicit context, occurrence UIDs,
origin and explicit start options, and requires a matching real queue emission
before success. Extension 0.1.2 requires host 14 and the visible-order marker;
unmatched playback is unknown, not success, with no automatic mutation retry.
The source-identity explanation remains a hypothesis pending phone testing.
See API2_SHUFFLE_R14.md for request evidence, verification scope and test limits.
R14 requires repatching; 0.1.2 alone cannot change the old embedded R13 adapter.

## R15 / Shuffle+ 0.1.3 and upstream release backports

The user reports R14 still preserves canonical playback order and requests
compatible upstream updates. Reviewed GitLab main c407383820660d4273703f53d517ce12beced77e.
R15 captures Spotify's normal native PlayCommand handler (p.cgz.a in the exact
9.1.94 APK) and awaits its interceptors/result instead of using direct Play RPC.
The native binding marker is now required on each emulator launch. 0.1.3 exposes
read-only active-adapter diagnostics and requires host 15/native-play-command.
Marketplace 1.0.0, backward-compatible author metadata/source persistence, and
compatible settings control fixes are backported; native renderer/theme/SDK
changes with unvalidated dependencies are documented and excluded. See
API2_R15_UPSTREAM.md for evidence, implementation, tests and phone acceptance.
This remains an unverified authenticated playback repair candidate until the
phone demonstrates the requested order. Both R15 repatching and ZIP replacement
are required. The four other local extensions remain 0.1.7.


## R16 / Shuffle+ 0.1.4: stale guards, navigation and glass (2026-11-07)

User reports R15 still makes no playback change, with SP_SHUFFLE_STALE; Open track
is inactive and glass has ghosted/pixelated text. R16 replaces whole-object/revision
comparison with URI/UID/queued-flag occurrence identity, keeps real stale guards
with specific codes and uses a fresh revision for SetQueue. Adds the missing
system/UI navigation registrations and conditional extension-overlay dismissal.
Glass capture excludes the foreground via INVISIBLE/finally, suppresses nested
captures and adds actual blur. Five real Android instrumentation fixtures and a
synthetic rendering artifact extend the emulator checks. See API2_R16_VALIDATION.md.
No logged-in playback, native ARM or Samsung acceptance is claimed. Do not ask for
credentials in chat; current CI has no secure interactive emulator sign-in handoff.
R16 module and 0.1.4 ZIP both required; other extensions remain 0.1.7. Draft PR2
stays unmerged. Wait for this revision's build/startup/instrumentation before delivery.


## R17 / 0.1.5 upcoming-queue repair in progress

User confirmed the failing action is Confirm upcoming shuffle and nothing changes.
Original APK inspection found native editor CommandOptions absent from our bare
request and a lazy observer subscribed only after command completion. A separate
codex/shuffle-queue-r17 branch checkpoints the repair: native editor options/section
metadata, real pre-dispatch subscription with disposal, and identity-free copyable
diagnostics. See API2_R17_QUEUE.md. Actual Android model/builders are added to the
existing CI fixtures; this is not authenticated queue playback. Do not claim a
phone fix or distribute new files before required build/startup/model checks.
No account credentials were requested. The draft PR remains unmerged. Both R17
module and ZIP 0.1.5 will be required; other extensions stay 0.1.7.

## R18 / Shuffle+ 0.1.6: collection playback stopped

The user supplied the R17 collection report (success reply, two queue events,
14 requested songs, zero observed upcoming, unconfirmed order) and confirmed
playback stopped. The listener was ready/disposed; this is a collection request
issue, not evidence that the SetQueue repair failed. Native factory/serializer
inspection supports source-identified explicit pages with empty resolver URL and
native-assigned UIDs. R18 replaces the failed anonymous-context experiment with
that shape, retains the native handler, and confirms only the latest post-send
state. A seventh real-APK serialization fixture compares to Spotify's own factory.
See API2_R18_COLLECTION.md for evidence, regression guards and testing limits.
No account credentials or authenticated playback were used. Both new files will
be required; preserve unknown journals and do not automatically retry mutations.

## R19 / Shuffle+ 0.1.7: preserve Autoplay after the verified selection

R18 diagnostics: correct first URI, 14 requested, 58 upcoming, four post-send
events and unconfirmed order. User confirmed previewed songs followed by extras
and explicitly chose Keep Autoplay. R19 retains the working R18 request; it
verifies requested URI positions and classifies only post-selection extras.
Only native provider=autoplay music without queued flags may follow; context,
manual or unknown extras still fail. Success/diagnostics distinguish the selected
window and recommendation tail. No global Autoplay settings or extra mutations.
See API2_R19_AUTOPLAY.md. An eighth real-APK provider-decoding fixture and the
14+45 simulation cover this boundary; authenticated phone classification remains
unverified until the new report arrives. Both files will be required.

## R20 / Shuffle+ 0.1.8: explicit remaining selection

R19 phone counters disprove a complete selected prefix: current correct, 14
requested, 51 upcoming, matching prefix zero, 12 Autoplay within selection and
38 after it. R20 starts a single-track context then installs the remaining
selection explicitly as queued items, preserving only typed Autoplay extras.
Per-observer dispatch gates, fresh CAS and partial-outcome reporting are required.
See [R20 evidence and limits](API2_R20_EXPLICIT_QUEUE.md). CI and artifact hashes
are recorded in PR2 after validation. This checkpoint does not claim live playback.

## R21 / Shuffle+ 0.1.9: asynchronous queue observer readiness

R20 phone report: firstTrackConfirmed true, selected-queue stage, no queueSent or
second-observer assessments, UNCONFIRMED_READBACK. A delayed second subscription
reproduced the exact R20 failure in Watch.latest before SetQueue. R21 awaits
initial state for both collection stages and queue-only edits, retains freshness
and post-dispatch confirmation, and adds stage-specific diagnostics. A silent
listener still stops safely; partial playback remains unknown. All staged waits
share a bounded deadline. See [R21 evidence and limits](API2_R21_OBSERVER.md).
A tenth Android fixture uses the actual pinned RxJava asynchronous publisher and
production observer. CI run/artifact hashes are recorded in PR2 after validation;
this checkpoint does not claim authenticated phone playback.
