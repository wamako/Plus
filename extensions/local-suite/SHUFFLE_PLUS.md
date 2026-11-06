# Shuffle+ 0.1.0 for Spotify Plus R13

Independent Android adaptation inspired by Spicetify's Shuffle+ (khanhas and
Tetrax-10). This is not the desktop file or rxri's audio-feature FeatureShuffle.
No desktop extension source is bundled. Fisher-Yates and the native protocol
adapter are independently implemented; Spotify 9.1.94 schema fields were inspected
in the supplied APK. Reference: spicetify/cli at
e95f8025c133c277c6601b1977cf3b39a2fa5c2f, Extensions/shuffle+.js. The Android
Spicetify/Morphe reference at 9cd3e744aa4cfdcf9464c285f102bb76c4bf5270 was reviewed
to understand explicit context playback; its implementation was not copied.

## Install

1. Repatch Spotify **9.1.94.1929 / arm64** using the **R13** Plus module in
   LSPatch. A ZIP alone cannot add the native playback adapter to R12.
2. Extract this ZIP. Put the **shuffle-plus** folder beside your existing four
   local extension folders in SpotifyPlusLocal. It must directly contain
   manifest.json and index.js. Do not nest it inside an extra ZIP wrapper folder.
3. Refresh the local extensions folder under Developer, then restart Spotify.
   Open **Shuffle+** from Extensions. Existing extensions **0.1.7** stay installed.

## Use

Start playback once so the native player repository is available.

- **Preview shuffled upcoming queue**: turn Spotify's native shuffle off first.
  Preview a Fisher-Yates permutation of the upcoming songs and explicitly confirm
  it. The playing song, exact native track occurrences/flags, and previous-track
  list are preserved. A trailing native delimiter stays at the end. Non-song
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
are single-use. A changed queue/player snapshot is rejected before dispatch; the
native SetQueue revision additionally protects upcoming-queue edits at the server.
Starting a collection uses normal Play, which does not provide a queue-revision
compare-and-set: it is an explicit user-requested playback replacement.

Each apply is one native command, with no clear/add loop, Web API fallback, or
automatic retry. A timeout or malformed acknowledgment is uncertain: inspect
Spotify's player and queue, then use **I checked playback; allow another shuffle**
before starting another action. This does not undo or repeat the earlier action.
Normal Spotify playback/account restrictions remain in effect.

This first release supports song collections and a loaded upcoming queue. Artist
discographies, folders, podcast shows and local files are not implemented.
Random permutations can naturally keep adjacent artists, duplicate source songs,
or occasionally the same order. There is no taste/artist weighting or deduplication.

## Validation limits

Production engine/protocol JVM checks, regression tests and the actual pinned
API-2 host-loader/renderer tests accompany the source. Android compilation and APK
class/native checks are required before delivery. Live playback and UI acceptance
on the user's Android 17 / LSPatch phone remain necessary. Begin with a small queue
or album. No Last.fm key or public Spotify audio-features endpoint is required.
