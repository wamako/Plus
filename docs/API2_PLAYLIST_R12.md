# R12 native playlist copies / extension suite 0.1.7

The old `SpotifyServices.modifyPlaylist` called `ModificationRequest.B()` and
loaded the creation enum from `p.t6l`. Inspection of Spotify 9.1.94.1929 showed
the builder factory is now `r()` and that enum is an unrelated UI class. Thus
native playlist creation failed before reaching the RPC. The Web API 404 is a
separate transport failure and is not fixed by changing native protobuf aliases.

`NativePlaylistWriter` handles only creation and appending tracks. It encodes
schema fields using the runtime's `*_FIELD_NUMBER` constants and parses through
the inherited protobuf-lite `parseFrom(defaultInstance, bytes)` method. This
preserves presence bits without mutating immutable default messages. Creation
origin is resolved by enum constant name and `getNumber()`. The queue repository's
native client is resolved by `ClientBase` type, not its obfuscated field name.
No other playlist operation is rerouted or added to the extensions.

Both request and response types and the Rx methods are resolved before dispatch.
Every call waits for its server result with a 15-second native deadline; the
extension retains its outer 30-second caller deadline. The native deadline does
not establish that a timed-out write was cancelled. Failures expose only fixed
codes: `SP_PLAYLIST_PREPARE_INPUT`, `_PREPARE_SCHEMA`, `_PREPARE_CLIENT`, `_RPC`,
`_ACK`, or `_REJECTED_<status>`. Preparation has not dispatched a request. RPC or
incomplete acknowledgments remain unknown and must not be retried automatically.
The extension names create/add stages and retains the new-copy URI and confirmed
count. Existing unknown journals are not cleared by an update.

Validation includes the production Java class on the JVM with independent
renamed-schema fixtures and request-byte assertions, the existing storage JVM
regression, JS write-order/failure regressions, all four bundles through the
pinned host loader, Android compilation and packaged DEX/native asset checks.
No physical phone, live Spotify account or LSPatch session is available here.
Device acceptance should start with a small, newly confirmed native copy before
attempting a 10,000-track range.

## Reproducible inputs after the upstream migration

The user supplied the new upstream repository:
https://gitlab.com/LeNerd46/spotify-plus

Runtime source stays pinned to `615455bf0a7a81cd2d01382a1f1e9e0a699fb082`;
this is not a wholesale upgrade to the current upstream runtime. The old GitHub
release and Beautiful Lyrics repositories are unavailable. The verified R11 APK
supplies only the unchanged Node binary and previously bundled Beautiful Lyrics
files; host Java/C++ and JS are rebuilt from source.

- R11 APK SHA-256: `176aac1fec257cf18b7f2fc002f5cad2be2f9cc774a69694094e34555abb5df2`
- Node SHA-256: `ce00e709fe6b84c5a57b48cbcba8549cf594d752d386a93a8b2c6b76fb9d021a`
- Source: GitLab pinned archive; extension SDK setup uses that same source pin.
- CI restores a cache or the retained R11 artifact from workflow run 42078701459.
  GitHub artifacts/caches can expire; retain the R11 APK for builds after expiry.
  Preparation fails closed if either binary checksum differs.

For a local rebuild: `python3 tools/prepare_api2.py --runtime-apk /path/to/R11.apk`,
then the Python checks and normal Gradle test/build/verification commands in CI.
The APK is a binary donor, not a patched precompiled host.
