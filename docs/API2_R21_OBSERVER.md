# R21 / Shuffle+ 0.1.9: asynchronous observer readiness

The R20 phone report confirms the first song (native success reply, matching URI
and assigned UID), then stops at selected-queue. The remaining 13 songs were
prepared, but queueSent, queueReply and queue assessment fields are absent. Two
events were seen, both post-dispatch, with no readbackError. This narrows the
failure to observation before the second command, rather than a confirmed queue
write. It does not prove that Spotify refuses SetQueue.

## Reproduction and repair

R20 called queue.latest immediately after subscribe returned. A listener can
return a Disposable before its scheduled initial callback arrives. The JVM
production bridge test now delays only the second subscription: unmodified R20
fails in Watch.latest with SP_SHUFFLE_UNCONFIRMED_READBACK and makes no SetQueue
call. R21 passes that same test by awaiting its initial state before the guard.
The older synchronous-only fixture did not cover this timing.

R21 waits up to two seconds for each collection listener's first state, compares
its fingerprint with the fresh pre-dispatch snapshot, and only then dispatches.
Queue-only reshuffling uses the same readiness barrier. An initial state is
readiness, not write confirmation; a separate post-dispatch matching event is
still required. Current/history/order verification, native queue CAS, manual
queue protection, duplicate handling and typed Autoplay preservation remain.
A silent listener times out without sending the pending command. Changes during
readiness still abort. There is no fallback, retry or automatic resend.

All collection waits use one monotonic 22-second budget after the engine's
at-most-five-second freshness read, leaving room in the host's 30-second timeout.
Each individual readiness wait remains capped at two seconds and each RPC at
five. Initial-state and deadline failures remain unconfirmed, with review required.
The first song may already be playing when the second listener fails.

Diagnostics now include explicit false playSent/queueSent defaults, separate
first/queue observer event counts, first/queue initial-state flags, readbackStep,
and an initialStateTimedOut flag. Only counts, fixed enums and booleans reach the
client; raw state, URIs, account information and credentials are excluded.
Host21 + observerReadiness capability prevents mixed installation.

## Validation and limits

Production JVM cases cover delayed first/second collection subscriptions, delayed
queue-only subscription, silent initial states before/after audio starts, queue
changes during delayed readiness, no-op, refusal, lost replies, latest-state
mismatch, cleanup and no retry. Client tests cover readiness capability gating,
new unconfirmed errors, journal review and safe diagnostics.

The tenth required Android fixture instantiates the actual production Watch
using the pinned Spotify APK's real RxJava BehaviorProcessor, a delayed background
Flowable, and PublishProcessor. It waits for asynchronous initial state, confirms
initial replay cannot prove a write, requires a new event and checks disposal and
silent-publisher timeout. Prior real-model, glass, intent and storage checks remain.
This fixture performs no Spotify account, client, playback or queue service call.
CI must also pass the ordinary two logged-out patched-Spotify launches.

CI revision/run and exact delivery hashes are recorded in PR2 after validation.
Generic x86 emulator checks do not establish authenticated Samsung ARM playback.
Both R21 module and Shuffle+0.1.9 ZIP are needed. Repatch the original APK, replace
only shuffle-plus, refresh/restart, inspect and acknowledge the previous unknown
action, then test a small album. If it fails, copy diagnostics before restarting.
The other four local extensions remain their separate 0.1.7 suite. PR2 stays draft.
