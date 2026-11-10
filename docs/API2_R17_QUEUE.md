# R17 / Shuffle+ 0.1.5: upcoming-queue acknowledgement without mutation

The user confirmed that R16 / 0.1.4 fails on **Confirm upcoming shuffle**, with
SP_SHUFFLE_UNCONFIRMED and no actual current-song or queue change. This is the
SetQueue path, not collection PlayCommand dispatch. No account access was used.

## Evidence from the exact Spotify 9.1.94.1929 APK

Original source SHA-256: a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304.
Its native repository p.rgz.b serializes SetQueueCommand, including optional
CommandOptions, into EsSetQueueRequest. Spotify's queue editor p.mdy0 builds the
command with CommandOptions.builder().overrideRestrictions(true).build(). Its
helper p.nmt0.e copies track metadata and assigns the is_queued section marker.
R16 used the bare create(revision,next,previous) command without those options.
The native source was inspected locally; implementation is an independent
reflection adapter, not copied application code.

The repository constructs GetQueue as a replay/ref-counted stream. R16 resolved
a Watch before dispatch but did not subscribe until after the native command
returned. That is not a live pre-dispatch observer and can lose an update.
These are concrete implementation mismatches. We have not reproduced the user's
logged-in service response, so neither is asserted as a proven sole cause.

## Change

NativeQueueCommand builds the same named native models/options as Spotify's
editor. It keeps current/history, URI/UID occurrences, providers, unrelated fresh
metadata and any existing trailing delimiter. It preserves the number of manual
queue slots and normalizes is_queued by resulting position, matching the editor
when occurrences cross the queued/context boundary. It does not append a new
end delimiter or truncate the underlying collection. Unsupported mixed section
markers stop before dispatch. Native service authorization remains authoritative.

A real two-consumer queue subscription starts before the command. It captures
updates during the native call and is disposed on every outcome. An observer
setup failure prevents sending the command. Five-second occurrence/order
verification, fresh revision CAS, single-use/expiry guards, and no automatic
mutation retry remain. No playlist/likes are edited. Collection Play dispatch
keeps its R15/R16 request, now with the same earlier observer lifecycle.

Unconfirmed outcomes now distinguish no observed queue change, wrong order,
and unavailable readback. Copy last shuffle diagnostics exposes a whitelisted
report with counts and comparison booleans only. It excludes raw states, song
IDs/URIs/titles, native exception messages, account names and credentials.
The client retains a safe report with the action journal; copying the native
report must occur before restarting the process.

## Validation

Production JVM fixtures cover native options, queue section reassignment without
mutating source tracks, a synchronous non-replayed update before the RPC returns,
no-op acknowledgements, observer readiness/cleanup, refusal, unknown/lost replies,
fresh metadata and duplicate occurrence identity. The no-op fixture models the
reported behavior; it is not an authenticated Spotify server reproduction.

The Android suite adds a sixth test. A checksum-verified original Spotify APK is
provisioned read-only into the isolated module's data directory. With ADB unrooted,
DexClassLoader loads its actual model/builders. The production command helper is
checked for real optional CommandOptions, duplicate UIDs, provider preservation,
section markers, unmodified original tracks and real Rx subscribe/dispose
signatures. No Spotify application, account or playback service is invoked by
that model test. The original APK is never published as an artifact. Root ADB is
used only for disposable fixture provisioning/retrieval, not the app tests.
Existing startup/storage, glass and intent fixtures remain.

Build/run outcomes must be recorded before delivery. Generic x86 Android17,
model/fixture and logged-out startup tests cannot establish authenticated
upcoming queue mutation or Samsung/native ARM acceptance. Never request a
password, login code or session token in chat. Both the R17 module repatch and
Shuffle+ 0.1.5 replacement are required; other four extensions remain 0.1.7.
