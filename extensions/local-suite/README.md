# Spotify Plus local Android extensions · 0.1.0

Four removable **initial Android adaptations** of the requested Spicetify projects.
Designed against the API-2 runtime shipped in Spotify Plus R10 for Spotify
9.1.94.1929 / arm64. These are not the original desktop extensions and do not
implement every feature of those projects. The working R10 APK is unchanged.
No extension is published to a marketplace.

## Install on your non-root LSPatch setup

1. Keep your working Spotify Plus R10 module. Do not install these files as APKs.
2. Extract `SpotifyPlus-Local-Extensions-0.1.0.zip` into a normal, accessible
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

| Extension          | Android functionality in this release                                                                                                                                                                                                                                                               | Not included from the desktop project                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listening Stats    | Opt-in local listening sessions; 30-second/90%-of-short-track qualification; top tracks/artists/albums; 7/30-day and all-retained ranges; daily activity bars and weekday totals; CSV/JSON clipboard export; optional Last.fm and Stats.fm top-50 reads                                             | Historical import, scrobbling, share images, draggable dashboard, full heatmap, exact listening while Spotify/module is suspended                                                                                          |
| Sort Play          | Playlist/album/track preview; title, artist, album, release date, date-added, duration and available popularity sorting; ascending/descending; search; URI or ISRC dedupe; one track per primary artist; known explicit/clean filters; artist-aware shuffle; new private copy; append queue; export | Desktop columns/player modifications, artist discography, Last.fm play-count/taste sorting, audio features/BPM/key/energy, liked/followed filters, color sorting, AI/chat, remote integrations, in-place source reordering |
| What’s That Genre? | Current/entered track lookup; Spotify artist genres; optional Last.fm tag fallback; descriptions and related genres from LucasOe's directory; Spotify links to artists and genre playlists                                                                                                          | Desktop player label injection, track-list columns, desktop theme modifications                                                                                                                                            |
| Playlist Plus      | Genre classification of playlist/album; Last.fm track→album→artist fallback then Spotify artist genres; Any/All multi-tag matching; genre counts/percentages; named presets; cached classification; shuffled preview; new copy, queue append, export                                                | Desktop menu replacement, automatic playback or queue replacement, full preset interoperability with the original extension                                                                                                |

## Behavior and limits

- API version **2**, unique extension IDs, plain JavaScript bundles, no native
  libraries, no downloaded code execution, no screen hooks. React/SpotifyPlus
  are supplied by the existing host, not bundled a second time.
- No playlist/queue mutation occurs on install, launch, read, sort, filter, or
  shuffle. Each write requires a separate preview and confirmation. Saves create
  a **new private playlist**, never edit the source. Queue actions **append**,
  never clear/reorder existing entries, and are capped at 100 tracks per action.
- Writes use the official Spotify endpoints; session scopes, account restrictions,
  Premium and an active player can affect availability. HTTP 401/403 is shown,
  not bypassed. **No uncertain write is retried automatically.** If stopped or
  interrupted, inspect the recorded partial copy/queue before manually trying again.
- Playlist reads support both new `item` and older `track` row formats, paginated
  in full up to 10,000 items. Failed/incomplete reads do not expose a partial
  preview as complete. A read-only native playlist/track fallback is attempted
  only for supported authorization/not-found errors. That R10 bridge may itself
  be unavailable; an error leaves the source intact.
- Podcasts, local-file playlist entries and null/unavailable metadata rows are
  excluded from playlist previews and counted as omitted. Local listening can
  record a local-file URI if the host exposes its playback state.
- Unknown fields stay unknown; sort values missing from Spotify stay at the end
  in either direction. A clean-content filter excludes unknown ratings. No BPM,
  popularity, play count, or genre is fabricated.
- Genre labels describe artists or Last.fm tags, not a guaranteed classification
  of every recording. Empty data remains Unknown. Last.fm tags can contain labels
  other than musical genres. Genre requests are cached with bounded retention;
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
  Spotify bearer tokens are confined to `api.spotify.com`. Keys and tokens are
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
3. Load a small playlist; compare count/order; sort/shuffle without writing.
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

Bundled dependencies: abort-controller 3.0.0 and event-target-shim 5.0.1.
See THIRD_PARTY_NOTICES.md for source inspirations and licenses.
