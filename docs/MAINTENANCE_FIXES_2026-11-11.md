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
