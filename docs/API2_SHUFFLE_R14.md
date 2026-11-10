# R14: verify Shuffle+ playback rather than acknowledging a no-op

User report after 0.1.1: Start shuffled playback leaves the real queue and song
order unchanged. R13 treated a default OK ContextPlayer response as proof that
the order changed. Its adapter fixtures returned OK without changing state, so
those checks could not detect this failure. No authenticated reproduction or
phone playback test is available in this environment.

R14 changes the independently encoded request to a self-contained anonymous
context with explicit pages and fresh per-occurrence UIDs. It no longer gives
the context the original album/playlist identity. The source URI is carried in
PlayOrigin.view_uri, with a Spotify Plus feature identifier; always_play_something
is explicit and skip index zero / shuffle false are retained. A named source
being resolved back to its canonical order is a hypothesis, not a confirmed
on-phone diagnosis. This request change needs phone acceptance.

Actual 9.1.94.1929 APK SHA256:
a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304.
DEX inspection confirms ContextTrack URI=1 / UID=2, anonymous Context.builder("")
and explicit page support, PreparePlayOptions.always_play_something=2,
PreparePlay.play_origin=3 and PlayOrigin.feature_identifier=1 / view_uri=3.
The real Play call site uses the same service/method and ResponseWithReasons.
No Spotify implementation is copied. Named-source resolution in the test server
is deliberately a failure model and must not be described as real Spotify proof.

Before dispatch the adapter resolves a read-only queue observer by Rx semantic
signatures (one Predicate-to-Flowable method and the no-arg Single reader in this
APK). After the one native mutation and OK acknowledgment, a five-second filtered
subscription ignores stale or nonmatching emissions. Collection verification
requires the exact requested current URI/UID plus every exposed upcoming URI/UID
in order, including duplicates. Multi-song requests require at least one visible
upcoming item. This is a visible-window check, not full 10,000-track readback.
Queue-only replacement checks the entire requested native next list including
its delimiter, the original current optional, and the original previous list.
Read snapshot timeout is five seconds, mutation RPC timeout fifteen, verification
five, keeping the operation inside the host's thirty-second async deadline.

A missing/mismatched queue is SP_SHUFFLE_UNCONFIRMED and an unknown journal result.
It consumes the ticket, reports no success, never retries a mutation, and requires
explicit playback review. Existing CAS/stale checks and all other extensions,
readers, playlist writes, settings, timers, styling and hook behavior are retained.
The API version stays 1; host capability is 14. Extension 0.1.2 requires host 14
and the additive visible-order result marker. Its UI explicitly describes the
scope of collection verification. It refuses an old host or count-only reply.

JVM fixtures execute the production adapter/protocol/engine with a simulated
transport and queue stream. They now change state for successful commands and
exercise OK-but-no-op, duplicate identities, refused/malformed replies and
readback. Real pinned SDK/renderer tests exercise the unconfirmed UI and durable
journal. These fixtures are not authenticated Spotify playback tests. CI builds
and validates both phone ARM and separate emulator x86 modules, then performs
its existing logged-out LSPatch/Node/extension/storage smoke checks.

Phone acceptance: repatch original Spotify with R14, replace only shuffle-plus
with 0.1.2, refresh and restart. Start with a small album of distinct songs;
compare the first previewed song and next three songs to the actual queue after
Start. Then test an upcoming-queue shuffle with native shuffle off, confirming
current/history are unchanged. If unconfirmed, inspect playback before retrying.
