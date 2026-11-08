# Shuffle+ 0.1.5 for Spotify Plus R17

Version 0.1.5 requires the **R17 module APK**. Repatch the original Spotify
9.1.94.1929 APK with this module; installing the ZIP or the module alone does not
replace an older module embedded by LSPatch.

Collection playback now uses Spotify's normal native PlayCommand handler and
its interceptors, rather than a direct Esperanto Play request. It supplies the
exact explicit song order and waits for the player/visible queue to match.
Use **Check active playback adapter** to verify module R17, the binding and live
player capture. If the player has not been captured, select a song from an album
or playlist in Spotify before preparing again. Errors include a fixed stage code.

Independent Android adaptation inspired by Spicetify's Shuffle+ (khanhas and
Tetrax-10). This is not the desktop file or rxri's audio-feature FeatureShuffle.
No desktop extension source is bundled. Fisher-Yates and the native protocol
adapter are independently implemented; Spotify 9.1.94 schema fields were inspected
in the supplied APK. Reference: spicetify/cli at
e95f8025c133c277c6601b1977cf3b39a2fa5c2f, Extensions/shuffle+.js. The Android
Spicetify/Morphe reference at 9cd3e744aa4cfdcf9464c285f102bb76c4bf5270 was reviewed
to understand explicit context playback; its implementation was not copied.

## Install

1. Repatch Spotify **9.1.94.1929 / arm64** using the **R17** Plus module in
   LSPatch. A ZIP alone cannot add the native playback adapter to R12/R13.
2. Extract this ZIP. Put the **shuffle-plus** folder beside your existing four
   local extension folders in SpotifyPlusLocal. It must directly contain
   manifest.json and index.js. Do not nest it inside an extra ZIP wrapper folder.
3. Refresh the local extensions folder under Developer, then restart Spotify.
   Open **Shuffle+** from Extensions. Existing extensions **0.1.7** stay installed.

## Use

Start playback once so the native player repository is available.

- **Preview shuffled upcoming queue**: turn Spotify's native shuffle off first.
  Preview a Fisher-Yates permutation of the upcoming songs and explicitly confirm
  it. The playing song, URI/UID occurrences and previous-track list are preserved.
  Queue-editor section markers follow their resulting slots, keeping the number
  of explicitly queued positions unchanged, as Spotify’s own editor does. A trailing native delimiter stays at the end. Non-song
  queues are refused instead of silently dropping episodes/local files.
- **Load and shuffle collection**: load a playlist, album, track, or Liked Songs.
  The complete loaded collection is randomized, preserving duplicates. For more
  than 10,000 songs choose a playback range from the shuffled order; no partial
  source read is accepted. **Prepare shuffled playback**, inspect the preview,
  then **Start shuffled playback**. This starts its first song and replaces
  upcoming playback using Spotify's normal native Play command with shuffle off.
  It never changes the source playlist or likes and never creates a new playlist.
- Album/playlist context menus can select a source for Shuffle+. Open the page
  from Extensions afterward. A player-shuffle-button replacement is not added.

Preparations do not change playback. Native tickets expire after two minutes and
are single-use. Song occurrence/order, queued flags, player-service or shuffle-option changes are rejected before dispatch. Revision-only updates and unrelated metadata refreshes do not invalidate a preview; the
native SetQueue revision additionally protects upcoming-queue edits at the server.
Starting a collection uses normal Play, which does not provide a queue-revision
compare-and-set: it is an explicit user-requested playback replacement.

Each apply is one native command, with no clear/add loop, Web API fallback, or
automatic retry. A timeout, unmatched queue or malformed acknowledgment is uncertain: inspect
Spotify's player and queue, then use **I checked playback; allow another shuffle**
before starting another action. This does not undo or repeat the earlier action.
Normal Spotify playback/account restrictions remain in effect.

This first release supports song collections and a loaded upcoming queue. Artist
discographies, folders, podcast shows and local files are not implemented.
Random permutations can naturally keep adjacent artists, duplicate source songs,
or occasionally the same order. There is no taste/artist weighting or deduplication.

The native queue may expose only a window of a large collection. Collection
success verifies the current song and that visible window; it is not a readback
of every song in a 10,000-song request.

## Validation limits

Production engine/native-command JVM checks, regression tests and the actual pinned
API-2 host-loader/renderer tests accompany the source. Android compilation and APK
class/native checks are required before delivery. Live playback and UI acceptance
on the user's Android 17 / LSPatch phone remain necessary. Begin with a small queue
or album. No Last.fm key or public Spotify audio-features endpoint is required.

R17 also restores the host navigation handler and closes this extension after
Open track is accepted. Android instrumentation exercises production glass
capture/drawing and intent resolution; these are not authenticated playback tests.


R17 upcoming-queue repair uses the native queue editor's CommandOptions and starts
its observer before dispatch. Success still requires actual observed order.
If it fails, use **Copy last shuffle diagnostics** before restarting Spotify and
send the copied report. It contains counts, stage/error codes and comparison
booleans, not song IDs, titles, account names, API keys or tokens. Unknown outcomes
still require checking playback and acknowledgement before another attempt.
The real-Spotify-model Android fixture validates request construction without an
account/service call; it does not prove authenticated queue mutation.
