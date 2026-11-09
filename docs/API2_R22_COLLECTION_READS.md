# R22: native Liked Songs reads and fresh queue entries

The R21 phone report reached both native commands and received success replies.
Current track/history matched, but only two upcoming positions matched the
14-song selection; 12 entries were observed for 13 requested. The user confirmed
missing/reordered songs in Spotify. Separately, internal Liked Songs routes
returned 403 and the Web route 404 while Spotify's own library worked normally.

## Request changes and limits

The exact pinned APK's ContextTrack.builder initializes UID and provider to empty
strings. Native insertion marks is_queued while preserving other fields. R21
forced provider=queue on fresh URI-only entries. R22 retains factory identity and
lets the native core assign occurrences. Order/duplicates, history, Autoplay-tail
objects, revision and editor options remain preserved. The Android fixture now
compares entries with the real factory and p.nmt0.e transform, then round-trips
the actual serializer. This proves request-shape alignment, not the phone's
missing-song mechanism. Strict order/current/history checks and no-retry behavior
remain; a mismatched queue cannot be reported as success.

JavaScript Liked Songs readers sent only an access token. Native metadata/profile
readers also use the captured Client-Token, which the SDK does not expose. R22
adds a narrow async LikedSongs facade and native read-only transport. Automatic
account identity uses the captured native username, avoiding a profile HTTP
dependency before the collection request. Fresh
credentials stay native; JSON/protobuf paging, completeness/duplicate guards,
cancellation and rate-limit stops remain in the client. Old hosts retain their
existing reader. Supported native requests never downgrade that same request to
bearer-only JS HTTP; the separate saved-tracks Web API read fallback remains.

Native reads accept the fixed Spotify host and collection-resolver GET families,
or a constructed collection paging POST. Collection account/arguments are
checked. Caller credentials/headers/methods are not accepted. Redirects are
blocked, calls capped at 15 seconds and responses at 4 MiB. Failures return fixed
codes/status only, without provider bodies, credentials or exception causes.
Client Base64 validation uses a bounded canonical round-trip: a grouped regex was
reproduced overflowing at the maximum payload size and removed.

The missing header is a plausible 403 explanation, not a verified live diagnosis.
No authenticated Spotify account was available in the build workspace.

## Installation and evidence

Use R22 (0.10.0-api2.9.1.94.22, code 39), suite 0.1.9 and Shuffle+ 0.1.11. Repatch
the original Spotify 9.1.94.1929 ARM64 APK with R22; refreshing JavaScript folders
cannot add the native reader. Shuffle+ requires host 22 and the explicit
native-factory-default capability. Keep app data and inspect previous unknown
outcomes before acknowledging a new action. Node 18.20.4 and Lyrics are unchanged.

Test-first cases cover queue identity, native auth/body construction, path/account
restrictions, redirects/status/privacy, size limits, JSON/protobuf pagination,
incomplete reads, cancellation and real SDK delegation. Independent review
verified the Base64 boundary fix. Repeated preparation exposed duplicate source
patching; an idempotence regression now guards it, and fresh/repeated preparation
and compilation pass. Final CI/head and exact file hashes are recorded in PR2
after validation. Samsung account/queue/library acceptance remains a phone step.
