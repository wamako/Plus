# R15: native playback pipeline and selected upstream release updates

User report: R14 / Shuffle+ 0.1.2 still plays the collection's original order.
Authenticated playback has not been reproduced in this environment. Do not claim
that a source-URI theory or a successful simulated reply establishes the cause.

## Playback

Our compatibility PlayerHook was a MediaSession shim. It never captured
PlayerHook.contextPlayer. Shuffle+ R13/R14 consequently sent ContextPlayer.Play
straight through a queue client's Esperanto transport, bypassing the normal
PlayCommand handler and its interceptors. Upstream's released PlayerSymbols and
PlayerHook identify and capture that actual handler.

R15 adopts the same semantic binding: a concrete owner with a ClientBase client
field and one Single(PlayCommand) method. The original 9.1.94 APK independently
resolves it to p.cgz.a. Constructor and ordinary Play calls capture the live
instance; the module does not construct a replacement service. Preparation builds
Spotify's named Context/ContextPage/ContextTrack and PlayCommand model objects.
It sends the exact explicit order, distinct occurrence UIDs, skip index/page zero,
always-play true and shuffle false through the captured handler, awaiting the
lazy Single and its native Success/Failure result. It does not use a direct Play
RPC or fall back to one. The obsolete ShuffleProtocol helper is removed.

Five-second player/visible-queue readback is retained after success, together with
single-use tickets, stale snapshot checks, handler identity checks and unknown
journals. No automatic retry is made on a lost result or unmatched queue. Queue
reshuffling still uses native SetQueue with original current/history. No playlist
or likes are edited. A collection readback checks the exposed queue window, not
all songs of a large request. Spotify's account restrictions remain in effect.

Shuffle+ 0.1.3 requires host 15 and route native-play-command. Its read-only Check
active playback adapter button identifies the actual loaded host, binding and
live-player capture. Failure messages include fixed SP_SHUFFLE stage codes.
If not captured, select a song from an album/playlist in Spotify before preparing.
The public SDK's playContext operation also uses the captured semantic dispatcher.

The package workflow now inspects six real model/builder signatures and the
unique handler in the exact supplied original APK before patching it. Each of the
two emulator launches must additionally log that the native Play binding was
installed; old Node/extension readiness alone cannot pass this check. This tests
binding installation, not authenticated playback or live command dispatch.

## Upstream review and compatible backports

Reviewed main at c407383820660d4273703f53d517ce12beced77e (2026-11-05):
https://gitlab.com/LeNerd46/spotify-plus/-/tree/c407383820660d4273703f53d517ce12beced77e
It contains two full-release commits after our 615455bf runtime pin. The readme
explicitly recommends Spotify 9.1.94.1929. The complete diff spans 302 files,
including a substantially changed native renderer, fingerprints, themes and SDK.

Selected updates are applied reproducibly by tools/apply_upstream_updates.py:

- Marketplace 1.0.0: compatibility badges and Spotify-version ranges, custom/root
  README discovery and safe relative assets, GitHub alert/image rendering,
  Original Spotify Plus collection, installed-source update checks and explicit
  same-version code reinstall. Checks distinguish unavailable/unknown sources.
- Runtime: accept both delivered legacy string authors and the release's author
  arrays; normalize display names without breaking existing local manifests.
  Save validated repository provenance with an atomic package install, expose
  installed-main reads only to the elevated marketplace, and retain that source
  across restarts, updates and rollback. Installed marketplace cards accept both
  legacy string authors and upstream arrays. The Cache.read await repair is retained.
- Settings: labelled/focused text fields, larger button targets, aligned toggles,
  fractional sliders mapped to native integer progress and clamped/snapped values,
  and numeric draft reset on blur. The about page identifies R15 and Marketplace
  1.0.0. Extensions now has an Extension settings launcher for this page.

The marketplace source uses both legacy authors and newer author arrays. Its
canonical author-array validation remains strict, while legacy metadata keeps a
fallback profile URL. Both projects typecheck against the exact embedded SDK,
not an older npm package. The obsolete nonexistent upstream compatibility-test
entry is removed; existing real marketplace suites and our host tests run.
An upstream cache-version assertion is updated from 4 to the actual schema 7.
No tests or functional failures are bypassed.

The base runtime pin, Node 18.20.4 binary, renderer protocol, Beautiful Lyrics
native APK, existing four-extension suite 0.1.7, legacy liquid-glass styling,
bookmarks, queue history, theme and custom sleep timers remain on their existing
implementations. Replacing the whole upstream runtime would change native
animation/worklet contracts, manifest authors and native plugin interfaces.
Therefore the new native theme editor/Compose targeting, native color picker,
settings-discovery API, native plugin hooks, token override and SleepTimer SDK
are not advertised or installed. Their dependencies have not been established on
this hybrid build. This does not remove the existing native theme/timer features.
MIT notices for the upstream backports are included in the module assets.

## Validation and acceptance

Production JVM fixtures require subscription to the native handler's lazy result,
run its interceptor path, preserve exact duplicate occurrences, and exercise
missing/replaced handlers, refusals, no-op acknowledgments, lost-after-write and
single-use guards. The old synthetic protobuf fixtures are no longer used to
validate collection playback. The real pinned HostRuntime installer is tested
with temporary files for source persistence, same-version updates, failed
preflight/activation rollback and path/repository rejection. Existing real
loader/renderer regression and Android build/startup/storage checks remain.

Install: repatch Spotify 9.1.94.1929 with the R15 ARM64 module, replace only the
shuffle-plus folder with 0.1.3, refresh and restart. Other four local extensions
stay at 0.1.7. Check active playback adapter, load a small album, prepare/start,
and compare its first song and next three queued songs with the preview. Physical
Samsung/ARM and authenticated playback still require this phone acceptance.
