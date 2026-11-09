# Spotify Plus local Android extensions · 0.1.9

Four removable Android adaptations for Spotify 9.1.94.1929 / arm64 / API 2.
Use **Spotify Plus R22** as the LSPatch module. No extension is published to a marketplace.

## 0.1.9 / R22 update

Repatch the original Spotify 9.1.94.1929 ARM64 APK with **R22**, then replace the
four suite folders and update Shuffle+ separately to 0.1.11. Refresh local
extensions, force-stop and reopen. Keep app data and avoid duplicate IDs.
The previous R21 APK does not include this native collection transport.

Liked Songs now prefers native authenticated reads when advertised by the host.
Spotify client credentials remain in Java. Complete paging, count/duplicate
guards, cancellation and rate-limit behavior remain. Errors still block the
preview. See [R22 evidence and limits](../../docs/API2_R22_COLLECTION_READS.md).
Earlier journal/performance changes below remain included.

## 0.1.8 update on R21

Keep `SpotifyPlus-9.1.94.1929-api2-r21-arm64.apk`. Replace the four suite folders,
Refresh local extensions, then force-stop/reopen Spotify. Do not clear app data
or leave duplicate extension IDs. The separate Shuffle+ package is 0.1.10; it
still requires R21/host21 and does not introduce a new playback protocol.

Playlist-copy and queue-append actions now write and read back their initial,
progress and final journal checkpoints. A missing/stale checkpoint blocks the
next mutation; failures preserve confirmed counts and any new-copy URI without
retry or transport fallback. Read-back verifies current storage; it does not
promise crash/power-loss durability. Existing unknown actions still require
inspection before another explicit action.

Sort Play's artist-aware shuffle retains its existing selection rule while
avoiding repeated scans and array shifts on large collections. Shuffle+'s
Fisher-Yates behavior is unchanged. Both versioned ZIPs are produced from the
same bundles tested by CI, with member checksums and deterministic packaging.
The retained binary-input release changes clean-build recovery only; embedded
Node and Beautiful Lyrics remain unchanged. See the repository's
[Node assessment](../../docs/NODE_RUNTIME_ASSESSMENT.md).

## R12 native playlist copies

R12 fixes the stale protobuf builder methods and creation-origin enum used by
native playlist creation and track insertion. Those names changed in Spotify
9.1.94. The writer now uses stable schema fields, resolves the native client by
its type, validates request and response schemas before dispatch, and waits for
each server acknowledgment. It creates a separate playlist and appends ordered
batches of up to 100 tracks. Your original Liked Songs or playlist is never
edited by this copy action.

Use **Preview native Spotify copy** in Sort Play or Playlist Plus, then explicitly
confirm it. Spotify's Web API may still return 404 with the mobile session; the
native path does not use that API. Native copies use Spotify's default visibility.
Check the new playlist's visibility in Spotify.

Version **0.1.7** distinguishes preparation failures (no request sent for that
step), explicit server rejections, and uncertain RPC/acknowledgment failures. It
names creation versus track insertion and retains the new copy URI and confirmed
track count. No uncertain write is retried or switched to another transport.
Existing unknown journals from older versions remain visible: inspect Spotify
before explicitly starting another copy. Zero confirmed tracks does not prove that no
empty playlist was created.

For this update on R21, replace all four local extension folders, then Refresh
the local extensions folder and restart Spotify. Existing
extension IDs and settings keys are preserved. R12 retains R11's persistent
storage repair. Settings that failed to save under R10 must be saved again.

## Update from earlier versions

Replace the four old extension folders with the four folders in this ZIP, in the
same selected parent directory. Do not leave a second copy with the same extension
IDs elsewhere under that parent. Press **Refresh** in the Developer page. If the
old version is still shown, force-stop and reopen Spotify. When updating from R10, activate the R12 module in LSPatch and repatch Spotify
first. A JavaScript folder refresh cannot add its missing native storage handler.
Keep your app data. Local listening
history, saved keys, and genre presets keep their existing settings keys.

Version **0.1.6** fixes settings saves that could capture the previous text when
a native input event and Save happened before the next React render. Save now
reads the latest input, validates the field, writes it, reads it back, and displays
an explicit success or failure message. API keys remain masked and never appear
in feedback. The saved settings are restored when the extension is reloaded.
A Last.fm key must be the 32-character API key itself. A blank Spotify username
option removes the override and saves automatic account lookup.

**Save settings inside each extension where you use them.** Sort Play, Playlist
Plus, What’s That Genre?, and Listening Stats have separate private settings.
Press **Save key**, **Save username option**, or **Save provider settings** and
wait for its saved confirmation. Lookup/load actions use the last confirmed
saved values, including when they follow Save immediately. A failed write or
read-back is reported rather than silently acknowledged. Saving confirms local
storage, not whether Last.fm accepts the key.

Last.fm HTTP 503 and other lookup failures no longer abort genre classification.
The extension retains your key, shows a warning and tries the remaining enabled
genre providers. It suppresses repeated requests to the failing provider for one
minute instead of sending one per song. Changing the saved key bypasses that
in-memory suppression. A 503 does not cause the key to be cleared. Authentication
errors remain visible; rate limits and cancellation still stop work. Missing
results stay Unknown, and temporary provider warnings are not saved with successful
genre cache entries. Last.fm rankings in Listening Stats cannot be replaced with
another provider's rankings: that page reports the service error and keeps its
settings and existing results available for a later manual retry.

Version **0.1.5** fixes a real-fetch compatibility defect: native Node fetch can
reject the previously bundled AbortSignal before sending any request. The reader
now uses a native AbortController when the host exposes one, or omits the signal
when the R10 sandbox does not. The 15-second caller deadline remains; without a
native controller the underlying request may finish after that deadline. A timed-out
write is always treated as uncertain and is never automatically resent.

Track/artist reads also try Spotify's raw metadata service. The current playing
song can use the host's supplied metadata immediately. Once Liked Songs membership
has been fully paged and checked, an individual metadata failure retains that
saved URI with an explicit unavailable label and controlled diagnostic, instead
of rejecting the entire library. It does not invent titles, artists, genres or
dates. Incomplete membership pages, cancellation and rate limits still stop reads.
A complete membership list can contain songs that cannot yet be sorted by title.

For saves, choose **Preview native Spotify copy** to use the host's native playlist
service rather than the public Web API. It creates a new playlist and awaits each
server acknowledgment; it never edits the original. **Native playlist visibility
follows Spotify defaults**: check it in Spotify. The existing **Preview saving a
new copy** requests a private playlist through the Web API. Both require their
own confirmation and use the selected range of up to 10,000 tracks. Neither path
automatically switches transport or retries after an uncertain outcome. The native
path still depends on the R10 Java bridge working with your installed Spotify build.

Playlist Plus shows all loaded songs until a genre filter is chosen, so missing
genres no longer leave its preview empty. Unknown songs stay excluded from an
active genre filter. Optional **Use MusicBrainz fallback (no API key)** supplies
artist genres when Spotify and Last.fm do not. It starts disabled. It sends the
artist name, accepts only one exact matching artist from a complete bounded search,
and verifies a Spotify URL relation when a Spotify artist ID is already known.
Name-only matches are labelled as such; missing or ambiguous matches stay Unknown.
Requests are serialized at least 1.1 seconds apart per extension and cached. Run
one genre extension at a time; a large uncached library can take a long time.

Version **0.1.4** removes the old 10,000-track read guard for Liked Songs and
supports up to **100,000 liked tracks** across up to 10,000 pages. It tries the
paged Liked Songs context first and reuses the returned title/artist metadata,
reducing per-track bridge requests. Processed context pages are released as they
are consumed; previews render 40 rows at a time. Incomplete counts, repeated pages
and duplicate liked URIs still stop the read rather than silently truncating it.

The alternate saved-collection parser now accepts optional sync tokens and full
protobuf integers, including unknown 64-bit fields and signed timestamps. This
fixes overly strict validation; it does not guarantee that a changed private
Spotify response format will be readable. The 0.1.3 no-ICU startup fix remains.

Large previews offer explicit **Copy range** choices of up to 10,000 tracks per
new playlist. Each range has its own name suffix, preview and confirmation.
Saving a range keeps the full loaded preview. Neither loading nor sorting writes
to Liked Songs. The ordinary playlist/album and per-copy guards stay at 10,000;
queue append stays capped at 100. Phone memory and Spotify permissions still apply.

Version 0.1.2 adds a dedicated **Load Liked Songs** button to Sort Play and
Playlist Plus. Use that button for your saved songs, including when the playing
context points to a generated playlist or some other collection. Liked Songs is
not loaded through a playlist-ID endpoint. The sorter operates on a preview;
saving creates a new playlist copy and never changes your likes or their save dates.

The loader reads Spotify's paged Liked Songs context, with its saved collection
and saved-tracks Web API as alternate read routes. It filters out
saved albums and removed items, keeps saved timestamps when supplied, and checks
cursors, snapshots, duplicate entries and incomplete pages. Context metadata is reused when available; missing track metadata
is hydrated through the existing native read path. Context responses may omit
saved dates, release dates, ISRC or popularity; those fields remain unknown. Reads never call collection
write/remove endpoints. Saved URIs with unavailable catalog metadata remain visibly
labelled in the preview, retain their save dates, sort last for unknown metadata
fields and skip genre guessing. The collection paging request uses a read-only protobuf
POST; the network helper treats its timeout as a read failure, not an uncertain write.

Account identity is detected from a personal collection context, the host's
current-account reader, or Spotify's profile API. If detection is unavailable,
open **Liked Songs account options** and enter your Spotify **username**, not your
display name. The optional username is private to this extension. No password,
access token or application key needs to be entered. Collection URIs such as
`spotify:collection:tracks`, `spotify:user:USERNAME:collection`, and
`https://open.spotify.com/collection/tracks` are recognized as Liked Songs. Ordinary
playlist IDs are never silently substituted with Liked Songs.

The 0.1.1 native album reader, artist-ID recovery and genre fixes remain included.

## Install on your non-root LSPatch setup

1. Use Spotify Plus **R12** for persistent storage. If updating from R10, repatch
   Spotify with the R12 module in LSPatch first. These extension files are not APKs.
2. Extract `SpotifyPlus-Local-Extensions-0.1.6.zip` into a normal, accessible
   directory, e.g. `Documents/SpotifyPlusLocal/` on the phone.
3. The extracted `SpotifyPlus-Local-Extensions` directory must contain four child
   folders: `listening-stats`, `sort-play`, `genres`, and `playlist-plus`. Each child
   contains **manifest.json** and **index.js**. Do not rename them or select a
   single JavaScript file.
4. Open **Spotify Plus → Extensions → Settings → Developer** and enable local
   extensions/developer mode. Use the local extension folder picker to select the
   **parent containing those four folders**. Grant access in Android's picker.
   Labels may differ slightly in the host settings. Refresh/reload extensions.
5. Open the four pages from Spotify Plus's **Extensions** launcher. You can also
   select a playlist or track through an added context action, then open the
   corresponding extension page. Pasting a Spotify share link/URI works even if a
   native context action is unavailable on this build.
6. Test a short playlist first. Enable Listening Stats recording explicitly;
   its local history starts empty. Genre filtering works best with your own
   optional Last.fm API key. No key from an upstream project is bundled.

To try one extension at a time, put just its folder inside the selected parent
and refresh. To remove it, remove that folder and refresh or disable local
extensions. Keep a backup of private data before clearing Spotify app storage.
Do not select a parent that also contains an older copy with the same extension ID.

## What is implemented

| Extension          | Android functionality in this release                                                                                                                                                                                                                                                                           | Not included from the desktop project                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listening Stats    | Opt-in local listening sessions; 30-second/90%-of-short-track qualification; top tracks/artists/albums; 7/30-day and all-retained ranges; daily activity bars and weekday totals; CSV/JSON clipboard export; optional Last.fm and Stats.fm top-50 reads                                                         | Historical import, scrobbling, share images, draggable dashboard, full heatmap, exact listening while Spotify/module is suspended                                                                                          |
| Sort Play          | Liked Songs/playlist/album/track preview; title, artist, album, release date, date-added, duration and available popularity sorting; ascending/descending; search; URI or ISRC dedupe; one track per primary artist; known explicit/clean filters; artist-aware shuffle; new Web/native copy; append queue; export | Desktop columns/player modifications, artist discography, Last.fm play-count/taste sorting, audio features/BPM/key/energy, liked/followed filters, color sorting, AI/chat, remote integrations, in-place source reordering |
| What’s That Genre? | Current/entered track lookup; Spotify artist genres; optional Last.fm/MusicBrainz fallback; descriptions and related genres from LucasOe's directory; Spotify links to artists and genre playlists                                                                                                                      | Desktop player label injection, track-list columns, desktop theme modifications                                                                                                                                            |
| Playlist Plus      | Genre classification of Liked Songs/playlist/album; Last.fm track→album→artist fallback then Spotify artist genres; optional MusicBrainz fallback; Any/All multi-tag matching; genre counts/percentages; named presets; cached classification; shuffled preview; new copy, queue append, export                                                | Desktop menu replacement, automatic playback or queue replacement, full preset interoperability with the original extension                                                                                                |

## Behavior and limits

- API version **2**, unique extension IDs, plain JavaScript bundles, no native
  libraries, no downloaded code execution, no screen hooks. React/SpotifyPlus
  are supplied by the existing host, not bundled a second time.
- No playlist/queue mutation occurs on install, launch, read, sort, filter, or
  shuffle. Each write requires a separate preview and confirmation. Saves create
  a **new playlist**, never edit the source. Web copies request private visibility;
  native copies use Spotify defaults, as stated in their confirmation. Queue actions **append**,
  never clear/reorder existing entries, and are capped at 100 tracks per action.
- Web writes use the official Spotify endpoints; session scopes, account restrictions,
  Premium and an active player can affect availability. HTTP 401/403 is shown,
  not bypassed. These read fixes do not grant write permissions: saves/queue writes
  still depend on either Web permissions or native bridge compatibility and may be rejected independently. **No uncertain write is retried automatically.** If stopped or
  interrupted, inspect the recorded partial copy/queue before manually trying again.
- Album and playlist reads prefer the host's native metadata readers. Albums
  preserve multi-disc order, duplicate occurrences, release dates and matching
  artist IDs. Truncated/incomplete native playlists fall back to the public API,
  then the older paginated native playlist reader. The public API supports both
  new `item` and older `track` row formats. Ordinary playlist/album readers enforce a 10,000-item limit;
  Liked Songs has a separate 100,000-track guard. All reject incomplete results. If every reader fails, the page shows stages
  and statuses; it never labels a partial collection as complete. Native bridge
  reads have a 17-second deadline and HTTP reads a 15-second deadline.
- Podcasts, local-file playlist entries and null/unavailable metadata rows are
  excluded from playlist previews and counted as omitted. Local listening can
  record a local-file URI if the host exposes its playback state.
- Unknown fields stay unknown; sort values missing from Spotify stay at the end
  in either direction. A clean-content filter excludes unknown ratings. No BPM,
  popularity, play count, or genre is fabricated.
- Genre labels describe artists or Last.fm tags, not a guaranteed classification
  of every recording. Empty data remains Unknown. Last.fm tags can contain labels
  other than musical genres. Successful genre requests are cached with bounded retention; failed/empty
  classifications are not persisted;
  classification concurrency is two, with a 15-second timeout on HTTP requests.
  Rate limits stop requests; no automatic retry loop runs.
- Local listening runs a two-second sampler only when recording is enabled.
  Writes flush at most every ten seconds plus explicit setting/export actions;
  sudden termination can lose that last interval. History holds the most recent
  10,000 sessions. Seeking, buffering, pauses and long sampling gaps are not
  credited. Sampling conservatively misses time between track changes, especially
  very short tracks. Activity dates/hours use the session's start time in the
  phone's timezone; sessions crossing midnight are assigned to their start day.
- Stats.fm/Last.fm data is separate from this device's history. Provider ranges,
  privacy and missing counts differ. Unknown remote counts display as unavailable,
  not zero. API keys/usernames are private per extension, not shared between pages.
- No network requests are made by default until you press a read/lookup/write
  button. Only opted-in listening sampling runs in the background. Third-party
  hosts receive only the requested metadata/username and the key you supply;
  Spotify bearer tokens are confined to Spotify’s exact `api.spotify.com` and
  `spclient.wg.spotify.com` hosts. Artist identification uses the same read-only
  metadata path as the native host; no Spotify credentials go to genre directories
  or third-party providers. MusicBrainz receives artist-name searches only after
  opt-in and no Spotify bearer token. Keys and tokens are
  never copied into exports or diagnostic messages. Clipboard exports require a
  tap and are capped at one million characters. CSV text is formula-escaped.
- Unmounting a page cancels subsequent work; an in-flight request can still finish.
  Unloading an extension clears its registered timers/listeners through the host.
  A write already accepted by Spotify cannot be undone by closing the page.

## Validation and phone acceptance

See VALIDATION.md for the recorded check results and device-test limits.

The source includes model/tracker/network/write tests plus a preflight using the
**actual pinned host loader and React renderer**. The preflight loads all four
API-2 bundles in user-extension sandboxes, checks registrations, mounts their
native view trees, exercises key flows, and unloads them. It does not emulate
Spotify's private obfuscated Java implementation, Android layout, live service
permissions, device idle behavior, or LSPatch injection. Those require a phone test.

Before using a large library, check on your phone:

1. Open and close each extension, including Android Back. Existing bookmarks,
   glass styling, queue history, lyrics and timers should still behave as before.
2. Enable local tracking, play for over 30 seconds, pause/seek/resume, reopen Stats.
3. Press **Load Liked Songs** and compare the loaded count to Spotify. Also load a
   small playlist/album; compare count/order and sort/shuffle without writing.
4. Save a copy and verify only that new copy changes. Append 1–2 tracks and verify
   they appear after the existing queue. If Spotify rejects the permissions,
   keep using read previews/exports and send the displayed error before any APK change.
5. Try genre lookup and Any/All filtering with a small collection. Verify Unknown
   entries stay excluded from genre matches. Try an invalid link/offline state.
6. Remove one extension and refresh; the others should still open.

## Rebuild from source

Use Node 22+ for the build tooling (phone output targets ES2020 / Node 18).
From this directory:

```sh
npm ci --ignore-scripts
node tools/setup-sdk.mjs
npm run check
python3 tools/package.py
```

`setup-sdk.mjs` fetches the pinned SDK commit
`615455bf0a7a81cd2d01382a1f1e9e0a699fb082`, installs its locked dependencies without
install hooks, and builds the SDK. It links that SDK and its matching React locally.
Alternatively point `SPOTIFYPLUS_SDK_SOURCE` at an already-built copy of that exact
`nodejs-src` directory and link it as `node_modules/spotifyplus` (plus the matching
host React). The build uses its official API-2 extension builder including the
required transformed-bundle marker. Never use a plain desktop Spicetify build.

There are no bundled runtime dependencies; React and SpotifyPlus are supplied by
R10. The incompatible abort-controller and its event-target-shim dependency were removed.
See THIRD_PARTY_NOTICES.md for source inspirations and licenses.
