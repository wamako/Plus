# R24: evidence for the remaining collection mismatch

R23 reported a confirmed first track, successful Play and SetQueue replies,
unchanged current/history, 9,999 requested upcoming songs and 80 observed entries.
Eight upcoming positions matched, then URI order diverged. This does not identify
whether Spotify omitted, relinked or reordered a song, and does not establish an
80-song queue limit. The first mismatching upcoming position is 9 (preview song 10).
The separate DNS failure concerned metadata enrichment; saved membership remained.

R24 does not change the native playback protocol or relax confirmation. It adds:

- First mismatch position, observed song's later expected position, and whether
  the expected song appears later in the visible selection window.
- Occurrence-aware ordered-subsequence and unexpected-entry counts, including
  duplicate URIs. A subsequence with gaps is still a failed exact-order match and
  is evidence of gaps, not a diagnosis of unplayable songs. Providers/item kinds
  are fixed enums; no URIs, titles, account values or metadata are copied.
- Explicit 20-song test ranges. Range changes clear prepared tickets; only the
  displayed range is submitted after Prepare and Start. The full randomized
  collection remains loaded. Prev/Next controls keep the UI bounded.
- Retained-song metadata errors omit the misleading "Track 1" and "No partial
  preview was used" claims. DNS failures remain visible, playability remains
  unknown, and a later read can recover. No write is retried automatically.

## Validation

Test-first cases cover the 10,000/80/8 report shape with a synthetic one-song gap,
a swap, a foreign item, a delimiter, exact windows and duplicate occurrences.
The full adapter verifies that a successful reply plus a gap remains unknown and
both observers dispose. JavaScript and real-loader UI tests cover range selection,
read-only preparation, ticket invalidation and metadata/DNS recovery. These are
fixtures; they do not prove the cause of the phone's mismatch or network failure.
CI/build results for the exact candidate are recorded in PR2 after completion.

## Phone step

Use R24 (code 41), Shuffle+ 0.1.13 and optional suite 0.1.11. Preserve app data.
Follow [the focused check](../R24_ACCEPTANCE.md). Do not clear an unknown action
until playback/queue have been inspected. Keep Autoplay as configured in Spotify.
