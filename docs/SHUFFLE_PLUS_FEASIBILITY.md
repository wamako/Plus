# Shuffle+ for Spotify Plus R12: feasibility

Subsequent approved implementation: see [R13 delivery](API2_SHUFFLE_R13.md).

Investigated 2026-11-06 in response to the user's request to assess conversion.
**The core feature can be ported, but the desktop script is not a drop-in API-2
extension and full native playback still needs an adapter.** This document is a
feasibility result, not an installation package or a claim of device compatibility.

## Sources inspected

- Built-in desktop Shuffle+:
  https://github.com/spicetify/cli/blob/e95f8025c133c277c6601b1977cf3b39a2fa5c2f/Extensions/shuffle%2B.js
  File blob: `873bc81e859d523e28713d7186a403bfb14788b1`.
  Authors in source: khanhas and Tetrax-10.
- Optional, different extension:
  https://github.com/rxri/spicetify-extensions/blob/02a5423c9456337e848544a05863637fefe6aae7/featureshuffle/featureshuffle.js
  Its README describes creating a new playlist from audio features. Code calls
  Spotify Web API audio-features, random search, playlist creation and insertion.
- A useful Android reference discovered during research:
  https://github.com/spicetify/morphe-patches/blob/9cd3e744aa4cfdcf9464c285f102bb76c4bf5270/extensions/extension/src/main/java/app/spicetify/extension/spotify/extensions/ShufflePlus.java
  Its project currently targets **Spotify 9.1.80.2221**, not the user's 9.1.94.
  Its own player bridge/protocol code is not supplied by Spotify Plus. Inspect
  and respect licenses before reusing code; no external code was copied here.

## What desktop Shuffle+ actually does

It loads the chosen collection, uses Fisher-Yates random permutation, constructs
the upcoming queue and calls the desktop client's internal setQueue. It preserves
the previous-track list, adds a delimiter and skips to start the new shuffled
order. It can update the playback context. Desktop entry points include context
menus and an optional queue button. Sources include albums, playlists, Liked
Songs, selected tracks, artist modes, folders, shows and local files.

These are desktop Spicetify interfaces: CosmosAsync, Platform.PlaylistAPI,
LibraryAPI, RootlistAPI, LocalFilesAPI, GraphQL, private PlayerAPI._queue/_client,
desktop menus, browser CSS/DOM and LocalStorage. R12's API-2 runtime is a different
environment. Copying the JS file or renaming a global will not convert it.

Fisher-Yates is independent of taste/artist weighting. Do **not** reuse Sort Play's
existing `smartShuffle` as if it were the same algorithm: that helper deliberately
tries to separate repeated artists, changing the distribution. Repeated source
occurrences must be handled explicitly; a permutation need not deduplicate URIs.

## R12 capability check

- Existing DataClient collection/context readers can supply playlist, album,
  track and Liked Songs input. Keep full pagination and incomplete-read checks.
- Existing API-2 React pages, settings storage and extension registration can
  implement the extension's UI without desktop DOM or CSS assumptions.
- Public SDK Queue exposes get/add/remove/move/clear, each mutation using a queue
  revision. It does **not** expose an atomic arbitrary-order replacement method.
- R12's captured native queue repository and `NextUpQueue` already resolve a
  SetQueueCommand by semantic signature. This is a promising adapter foundation,
  not proof that a general full-playback extension currently works.
- Replacing a queue with clear+add or thousands of Queue.move calls creates
  intermediate partial states and stale-revision windows. Do not present that as
  an atomic Shuffle+ implementation or use public Web queue writes as a fallback.
- The Android reference uses native ContextPlayer.Play with an explicit shuffled
  track context and shuffle disabled. That is another adapter route worth
  evaluating against the actual 9.1.94 APK before choosing an implementation.

## Recommended port boundaries

Keep Shuffle+ as a separately removable local extension with its own unique ID
and private state. Reuse the tested readers and implement its own Fisher-Yates
permutation and preview. Add only the native playback/queue operation required
for applying that order; decide between a small host bridge addition and a native
extension component after testing actual native signatures/lifecycle behavior.
Do not promise that full queue replacement is JS-only on the existing R12 SDK.

Initial targets: playlist, album, Liked Songs, and a loaded queue. Desktop artist
discography/folder/show/local-file modes require additional readers and should be
added only when their exact Android equivalents are implemented and verified.
FeatureShuffle's audio-feature recommendation is separate scope and would inherit
the currently observed public Web API availability problem.

Before applying a shuffle: obtain a fresh snapshot, preview the chosen order and
confirm the action. Preserve history and, for an upcoming-queue reshuffle, preserve
the playing track. Starting a different collection should be an explicit Play
action, not an implicit skip while previewing. Refuse a stale snapshot rather than
silently overwriting a user's queue edits. Await the native acknowledgment, stop
on uncertain outcomes and never automatically retry. Preserve Spotify account
playback restrictions and report a refusal rather than attempting to bypass it.

Testing should cover exact occurrence preservation, non-mutating previews,
empty/singleton/large collections, deterministic permutation fixtures, unbiased
bounded-index selection under its RNG assumptions, stale snapshots, playback
transitions, lost acknowledgments, native history preservation, independent
extension unload and the real pinned loader. Device acceptance on the user's
LSPatch/Android 17 installation remains necessary.
