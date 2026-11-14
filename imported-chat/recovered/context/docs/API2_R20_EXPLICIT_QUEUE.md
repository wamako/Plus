# R20 / Shuffle+ 0.1.8: explicit selected queue

The user's R19 report had 14 selected songs, correct current URI and native UID,
51 upcoming songs, zero matching upcoming prefix, 12 Autoplay items inside the
13 requested upcoming positions and 38 extra Autoplay items. Five post-dispatch
events were observed. This is a real selected-order mismatch; the Autoplay-only
tail permission cannot explain or accept it. One plausible explanation is canonical
source continuation (one remaining context song plus 50 recommendations), but
these counters alone do not prove that internal mechanism.

## Repair

Collection playback now makes a planned two-step native operation:

1. Start only the first selected song as a single-track context. Keep the source
   as PlayOrigin.viewUri, not as an album/playlist resolver identity. Set shuffle,
   repeatingTrack and repeatingContext false for this playback.
2. Confirm its post-send URI and native-assigned UID. Read a fresh queue revision;
   reject changed player/current occurrence and any manual/context/untyped tail.
   Install the remaining songs as explicit queue entries (provider queue,
   is_queued true, empty UIDs for native assignment), preserving native Autoplay
   tail objects, previous history and an existing terminal marker. Verify current
   occurrence, history and the exposed selected URI order after dispatch.

Both dispatchers and model builders are preflighted without mutation. Existing
manual queue entries stop collection preparation; the action never clears them.
Each observer has its own dispatch gate and local event count. The second
observer's replay cannot satisfy its confirmation. Queue CAS uses the fresh
revision, and a changed initial replay aborts before SetQueue. Two steps are not
atomic: a failed second step is unknown and may leave the first song playing.
No retry, fallback transport, playlist edit or global Autoplay change is added.
Collection apply has a maximum sum of 27 seconds of native waits, including the
engine freshness read, inside the host's 30-second timeout. Large requests still
verify only the exposed native queue window.

The UI names the two steps, manual-queue requirement, repeat/shuffle effect and
partial-failure consequence before confirmation. Host20/first-track-explicit-queue
capabilities prevent a new client from running against older adapters. Diagnostics
add fixed stage/play/queue counters/statuses; no identifiers or credentials.

## Validation

JVM production choreography models a player which accepts only the first song,
not a fake handler that installs the full preview. It checks explicit queue
installation, duplicates/native UIDs, preserved Autoplay objects, singleton
no-second-write, stale/manual/context changes, queue no-op/refusal/current change,
match-then-stop, lost replies, first/second observer failures and disposal with
no retry. Bounds include 9,999 selected upcoming entries plus a preserved tail.
Existing pure order/provider and queue-identity tests remain.

Nine required Android fixtures include real Spotify model construction and actual
ProvidedTrack serialization/decoding for the new explicit manual entries. The
single-track context wire bytes equal Spotify's own native factory. Other glass,
intent and provider-boundary fixtures remain. The ordinary Android17/LSPatch job
also launches patched Spotify twice logged out and checks readiness/storage.
These checks do not perform authenticated music playback, server queue mutation
or Samsung ARM rendering acceptance. Successful emulator tests cannot certify
the phone's queue result. Test a small album and copy diagnostics before restart.

CI run, exact artifact hashes and delivery status are recorded in PR2 after build.
Both R20 module and separate Shuffle+0.1.8 ZIP are required. The other four local
extensions stay their independent 0.1.7 suite. No PR is merged by this task.
