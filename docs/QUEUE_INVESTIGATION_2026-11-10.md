# R25 queue-order investigation, November 10, 2026

## User retest update — November 11, 2026

The user reports that Shuffle+ now works as intended and will continue testing.
This supersedes the unresolved user-facing status below. No local playback code
change was made during this investigation; the cause of the prior omissions is
still unestablished. The song-4 diagnostic request is no longer needed unless the
failure returns. Retain the following record as historical investigation evidence.

## Report and source

Investigated the user's latest host-25 report against R25 commit
`473218cb88d70f0698adda69b62ff6035d68cac1` on the local branch
`codex/r26-queue-investigation`. This branch name is an investigation label;
no R26 module, release or playback fix has been produced.

The report requests 12 songs: one current song and 11 upcoming entries. Spotify
acknowledges both native commands, but reports only 9 upcoming entries, with two
matching initial positions and an interior gap at upcoming position 3 (preview
song 4). Observed entries form an ordered subsequence with two skipped selection
positions and no unexpected entries. The outcome correctly remains unknown with
`SP_SHUFFLE_UNCONFIRMED_ORDER`.

## Findings

- `ShufflePlusBridge.NativeBackend.play` passes the observer's raw `nextTracks`
  list directly to `CollectionOrder.inspect` during collection confirmation.
  No module-side filtering or nine-entry truncation was found in this path.
- `snapshot` removes only a final delimiter when constructing a request. The
  confirmation assessment still uses the original observer state, not that
  transformed list.
- `CollectionOrder` checks occurrence order, including duplicate URIs. An
  interior gap is rejected. Successful Play/SetQueue replies cannot override
  this failed verification.
- Matching but incomplete prefixes are deliberately treated as bounded visible
  queue windows; tests explicitly distinguish that policy from an interior gap.
  Unobserved trailing positions cannot be declared missing without additional
  evidence about window completeness.
- New queue entries retain Spotify's factory-default empty UID/provider and
  set `is_queued=true`. Existing real-model instrumentation compares this shape
  with Spotify's own queue marker and serializer. That proves construction,
  not authenticated bulk queue acceptance. Changing these fields speculatively
  would not constitute a demonstrated repair.
- The recovered R25 runtime routes `Navigation.openSpotify` through the native
  navigation bridge and closes the extension surface on an affirmative result.
  `SystemHook` registers system/UI handlers and constructs a package-restricted
  Android intent. Existing Android instrumentation checks intent resolution;
  it does not prove signed-in navigation on the user's Samsung phone.
- R25's recovered rendering report explicitly excludes Samsung rendering and
  authenticated playback. The missing original screenshots prevent matching a
  proposed visual change against the user's reported artifact.

No production behavior was changed: no demonstrated root cause for the phone's
omissions or current rendering failure was established from these artifacts.

## Local validation performed

The package.json test selection was run directly with Node:

```
node --test extensions/local-suite/tests/core.test.mjs extensions/local-suite/tests/native-reads.test.mjs extensions/local-suite/tests/liked-songs.test.mjs extensions/local-suite/tests/recovery.test.mjs extensions/local-suite/tests/settings.test.mjs extensions/local-suite/tests/shuffle.test.mjs extensions/local-suite/tests/write-journal.test.mjs extensions/local-suite/tests/sort-shuffle.test.mjs extensions/local-suite/tests/liked-read-contract.test.mjs
```

Result: 157 tests passed, zero failures/skips. This covers source reads,
occurrence preservation, range-ticket invalidation, saved settings, mutation
journals and unknown-result handling. It does not simulate Spotify's server.

With the bundled Python and a portable Microsoft JDK 21 on the process PATH,
using a writable temporary folder under the checkout:

```
python -m unittest tools.test_collection_order tools.test_selection_request tools.test_shuffle_engine
```

Result: 6 unittest cases passed in 31.621 seconds. These compile and exercise
production Java with renamed JVM transport/model fixtures, including staged
dispatch, occurrence order, missing-song rejection, observer readiness, stale
guards, duplicate entries, typed Autoplay tails and cleanup.

Initial execution failed because the default temporary directory was not
writable in this session; setting process-local TMP/TEMP to the checkout's
ignored scratch folder allowed the same tests to pass. No test was weakened.

The Android app was not rebuilt or launched in this local Windows environment;
no Android SDK/emulator or connected device was available on the inspected paths.
No workflow was dispatched, and no changes were pushed or merged.

## Evidence needed to distinguish causes

1. Preserve the exact failing preview and identify song 4 by title or Spotify URI.
2. Open that same song directly in Spotify and check whether it plays.
3. Add it through Spotify's own Add to queue, then inspect whether it appears.
4. If native queue insertion works, compare the same small selection through
   Shuffle+ and retain the new diagnostic report and actual queue order.

This distinguishes a track-specific rejection from a module queue-insertion
problem. It does not require reinstalling, changing the source collection or
providing account credentials. Unknown operations must still be inspected before
retrying; no automatic replay or weakened verification was introduced.
