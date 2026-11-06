# R13 Shuffle+ adapter and separate 0.1.0 extension

The user approved building the Shuffle+ adaptation after reviewing feasibility.
R13 adds its native engine/protocol/async operations and one additive SDK
namespace. The R12 playlist writer, R11 storage repair, hooks, styling, timers,
history, marketplace and pinned runtime version are retained. Existing local
extension 0.1.7 bundles/manifests were rebuilt and compared byte-for-byte with
the delivered ZIP: all four match. Shuffle+ is a separate install, with unique ID
`com.wamako.shuffleplus`; it is not published to Marketplace.

`ShuffleEngine` keeps at most two previews, expires them after two minutes, and
consumes each ticket once. It validates a complete occurrence-index permutation
and checks repository identity, queue revision, snapshot fingerprint and shuffle
state before applying. Duplicate URIs remain separate native track occurrences.
No mutation occurs during capabilities, read, shuffle or prepare operations.

`ShufflePlusBridge` resolves the live queue stream and client by type and named
model/Rx signatures. Upcoming-queue reshuffle requires native shuffle off and
uses one SetQueueCommand, preserving original track objects/metadata, previous
tracks and a trailing delimiter. Its revision is checked natively by Spotify.
The currently playing track is not advanced. Unsupported non-song queue entries
are refused without partial filtering.

Collection playback prepares one native ContextPlayer.Play command containing
an explicit ordered context page, skip index zero, and shuffle override false.
The schema constants and response enum were inspected in Spotify 9.1.94.1929's
DEX. No source URL is included that could trigger a context reload in place of
the explicit page. Playlist/album/track/Liked Songs input uses existing complete
DataClient readers. The entire loaded collection is randomized before explicit
10,000-track playback ranges are offered. No playlist or likes are modified.
Normal Play manages its own playback history; this path does not manually
replace a previous-track list. A Play request has no queue-revision CAS and is
an explicit replacement of upcoming playback/start of the selected first song.

The additive `SpotifyPlus.ShufflePlus` namespace dispatches through requestApi.
The SDK's generic `request` is a different legacy message path and must not be
used for these operations. `tools/patch-shuffle-sdk.mjs` applies the same patch
to the source used for the Android host and the local extension SDK. Preparation
fails if pinned source anchors change. There is no host runtime version upgrade.

Native commands wait for acknowledgment with a 15-second deadline, inside the
bridge's existing 30-second asynchronous request deadline. A timeout does not
prove cancellation. Fixed SP_SHUFFLE codes describe known pre-dispatch failures,
Spotify refusals and unknown RPC/acknowledgment outcomes without echoing account
data. The extension journals before dispatch and checks that write; uncertain
or interrupted pending actions require the user to inspect playback and explicitly
acknowledge before another apply. No automatic retry or Web API fallback exists.

Validation runs production engine, native adapter and protocol code on the JVM
with independently renamed schema/client/model/Rx/JSON adapters. It checks actual
reflection routing and serialization bytes, original-object/history preservation,
stale and single-use previews, expiry/limits, server refusals and malformed replies.
JS tests cover the Fisher-Yates branches, duplicate/input preservation, large
permutations, exact writes/journals, confirmation, cancellation and uncertain
outcomes. A ninth actual pinned loader/renderer profile loads Shuffle+ as a user
extension, clicks queue and collection flows, verifies no preview writes, renders
stale/lost outcomes, acknowledges uncertainty and tests independent unload.

Device testing remains necessary on the user's Android 17/LSPatch phone. In
particular verify native player authorization, exact playback order, collection
context behavior and native history. Start with a small queue/album. Artist
discography, folder/show/local-file readers and player button replacement are
outside this first release.

Reference/attribution and phone instructions are in
`extensions/local-suite/SHUFFLE_PLUS.md`. No external extension implementation
was copied. Source preparation, all local extension checks, Android build, and
actual packaged adapter/DEX/native assets are required in CI before delivery.
