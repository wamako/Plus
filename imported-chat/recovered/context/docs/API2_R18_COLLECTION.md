# R18 / Shuffle+ 0.1.6: collection playback stops

The user's R17 report identifies **collection**, not the SetQueue path:
sent=true, reply=success, expectedTrackCount=14, eventsObserved=2,
observedNextCount=0, visibleOrderMatches=false, observerDisposed=true,
SP_SHUFFLE_UNCONFIRMED_ORDER. They confirmed that playback stopped.
This establishes no usable confirmed order; it does not identify a server-side
cause or establish that an authentication/account restriction was involved.

## Source evidence and request change

The original Spotify 9.1.94.1929 APK is pinned to SHA-256
a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304.
Its Context.fromTrackUris(source, tracks) creates a context with the supplied
identity, a populated explicit page and no resolver URL. ContextTrack.create
leaves UID empty for native assignment. The normal PlayCommand path p.cgz.a
uses p.u3x to serialize Context via p.pkm1.i and prepare options via p.x7e0.r.
The serializers do carry explicit pages/tracks: omitted page serialization was
investigated and is not supported by this APK's code.

R17 retained the R14 anonymous-context experiment and invented occurrence UIDs.
R18 independently builds the native factory's context shape: original source
identity, exact supplied order/duplicates, empty resolver URL and default UIDs.
It requests index/page zero, shuffle false and initiallyPaused=false, leaving
alwaysPlaySomething unset. There is still one normal native PlayCommand through
the captured handler; no direct transport fallback or automatic retry is added.
The failed anonymous-context hypothesis is retired. Native factory compatibility
is evidence for this change, not proof of the authenticated failure's sole cause.

The older Android Spicetify/Morphe reference was reviewed at
9cd3e744aa4cfdcf9464c285f102bb76c4bf5270. Its explicit-page request also keeps
the source identity and omits a resolver URL/assigned track UIDs. Its encoder and
bridge are not copied or used; its target version is different.

## Readback and regression protection

For a freshly started collection, native-assigned UIDs cannot be predicted.
Readback checks the exact current URI plus every exposed upcoming URI in order,
including repeated positions. Multi-song playback still requires an upcoming
song. It does not claim a full large-context readback. Existing queue edits
continue to preserve and compare their original URI/UID/queued-flag identity,
current song, history and CAS revision.

Initial replay never confirms an action. Only a post-dispatch event can match,
and confirmation uses the latest observed state after the native reply, rather
than remembering any earlier match. A match followed by an empty queue before
the reply remains unconfirmed. Observer setup, disposal, stale/single-use/expiry
guards and unknown-action review remain. No playlist or likes are edited.

Safe diagnostics add requestFormat, postDispatchEvents, currentPresent,
currentUriMatches and currentUidAssigned. No raw URIs, UIDs, metadata, account
names, credentials or exception messages are included. Both R18 and extension
0.1.6 are required; the collectionMode capability prevents mixed installations.
The other four local extensions remain 0.1.7, and R17 queue-editor options,
navigation, glass, marketplace, settings and timer implementations remain.

## Validation scope

JVM regressions model native-assigned UIDs, initial matching replay with no
post-dispatch event, no-op/lost replies, and a matching intermediate state
followed by empty playback before acknowledgment. Those simulations are not
authenticated Spotify reproductions.

The seventh Android fixture loads the checksum-verified, read-only original APK.
It serializes the production context using Spotify's actual p.pkm1.i and compares
the bytes to Spotify's own Context.fromTrackUris factory for an ordered list with
duplicates. It independently inspects encoded page/track/source/UID fields and
checks actual option models plus p.x7e0.r serialization. No account, client,
service or playback operation is invoked. Existing six Android fixtures and
patched startup/storage gates remain. All app tests run with unrooted ADB;
fixture provisioning/retrieval alone uses disposable-emulator root.

Build/test results must be recorded before delivery. Model/serialization and
logged-out emulator tests cannot prove signed-in playback on the Samsung phone.
Repatch original Spotify with R18, replace only shuffle-plus with 0.1.6, refresh
and restart. Check the adapter identifies R18, test a small album and compare
current/upcoming order. On failure copy diagnostics before restarting, inspect
playback and acknowledge the unknown action before preparing another attempt.
