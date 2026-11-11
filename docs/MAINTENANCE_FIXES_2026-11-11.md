# Maintenance fixes, November 11, 2026

These are source changes on `codex/r26-queue-investigation`, based on R25.
The user reports Shuffle+ working; its playback protocol was not changed.
No new APK or version number has been issued, and Android build/device checks
remain outstanding for these changes.

## Saved sleep-timer edits

Previously, add/delete/reorder updated the manager's list before checking the
SharedPreferences commit. If a save failed, retrying an add could encounter the
unsaved duplicate and show success without attempting another save. Delete and
reorder errors also escaped the click handler.

`SavedTimerDurations` now stages edits in a copy, saves first, then publishes the
new list. Both preset-saving entry points use it. Failed edits leave the
manager's previous list intact and report the error in the sheet; retries can
persist the requested change. Starting a timer still starts it before an optional
preset save; its countdown is refreshed even if saving fails, so an active timer
is not hidden by a preset error. Existing preference key, value/unit JSON format,
native menu integration and default durations are retained.

Regression tests first failed for phantom additions and failed removal. The
corrected model passes add/retry, failed remove/reorder, duplicate/no-op, snapshot
and invalid-duration checks. These tests exercise the production model with a
storage fake; they do not simulate Android SharedPreferences internals or an
on-device storage failure.

## Previous-song history

The native-history import used a set of song URIs and pre-excluded the current
song. That collapsed repeated plays and discarded earlier occurrences of the
current song. Ordinary live transition recording already retains repeated plays.

Import now preserves every native history occurrence in newest-first order,
including previous plays of the current song, while retaining the existing
100-entry cap and save-before-publish behavior. An established local history is
still not overwritten by the import.

Two tests failed before the fix: an A/B/A history with A currently playing
imported one entry instead of three; 105 alternating plays imported two entries
instead of the newest 100. Both pass after the fix, including restoration from
persisted history.

## Validation

Compiled all eight feature-model test classes against the project's pinned Gson
2.13.1, JUnit 4.13.2 and Hamcrest 1.3 with a portable JDK 21, and ran JUnitCore:
21 tests passed, zero failures. This includes bookmarks, sleep duration parsing,
native preset merging, header inset calculations, glass target selection,
menu-entity discovery, history and saved-duration edits. `git diff --check` passed.

No Android SDK/emulator is configured in this checkout. The CustomSleepTimer
Android sheet and native player integration have not been rebuilt or exercised
on a phone for these changes. Required follow-up is an Android build and device
checks of saving/editing presets and repeated-song history. No new dependency was
added to the app and no repository changes were pushed or merged.
