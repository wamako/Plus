# R16 / Shuffle+ 0.1.4: preview identity, navigation, and glass capture

The user reports SP_SHUFFLE_STALE before any playback mutation, an inactive
Open track button, and ghost text/pixelation in glass surfaces. Authenticated
playback is still not available in this environment. CI startup is not playback
acceptance. Do not request or store the user's password, login codes or tokens.

## Preview lifetime

R15 compared both the queue revision and a hash of PlayerQueue.toString(). That
rejects revision-only changes and metadata enrichment even when song occurrences
are identical. This overstrict comparison is reproduced by regression fixtures;
the specific changed field on the user's phone has not been captured.

R16 fingerprints current, previous and upcoming URI/UID occurrences, including
duplicate ordering, delimiter position and the is_queued flag. It ignores title,
artwork, unrelated metadata, and revision changes. Apply reads a fresh snapshot
and uses its live revision and native track objects for SetQueue's native compare-and-set.
Queue readback uses the same occurrence identity, so enrichment after dispatch
also cannot masquerade as a failed reorder. Repository,
order, shuffle-option and playback-handler changes remain rejected with separate
STALE_OWNER / STALE_ORDER / STALE_OPTIONS / STALE_PLAYER codes. Tickets remain
expiring and single-use, with no automatic mutation retry. Collection playback
still requires native result plus current/visible queue readback. No playlist or
likes are changed. Readback is not full-list confirmation for large contexts.

## Navigation

The hybrid host omitted the system/UI handler required by Navigation.openSpotify.
SystemHook now registers both before Node starts. It validates/resolves Spotify
and browser intents, schedules launches on main, and reports failures via toast.
The exact embedded SDK closes the calling extension overlay after navigation
acceptance. A failed resolution leaves that page mounted. Existing local
extensions benefit without changing their own ZIPs. The boolean acknowledges
accepted navigation, not authenticated availability of the requested song.

## Glass

The previous backdrop capture set foreground alpha to zero before software root
drawing. Alpha is a render-node property and does not reliably exclude that
foreground path. Capture now temporarily makes the whole foreground subtree
INVISIBLE, without changing layout; visibility is restored in finally. Nested
captures are suppressed globally. Three separable box passes blur the downsampled
bitmap instead of treating coarse downsampling as blur. Old bitmaps are released,
and queued captures of replaced backgrounds are ignored. The pill style and native
hit targets are retained. No full-screen screenshot is saved by this feature.

## Validation scope

The exact production engine/adapter JVM fixtures cover revision-only refreshes,
metadata changes, fresh revision dispatch, duplicate/current occurrence changes,
queued flags, lazy native handling and unknown results. Real pinned loader tests
press Open track and require the overlay to remain on failed navigation and
unmount on successful acceptance. Existing regression and storage checks remain.

The Linux API37 x86 emulator now also installs a separate Android instrumentation
APK and executes five production-code checks: repeated foreground exclusion and
glass drawing, actual blur, failed-capture cleanup, resolution of a track intent
to the installed patched Spotify package, and unsafe-link rejection. A synthetic
fixture PNG is retained for visual review; no Spotify account screenshot is saved.
The test APK is not a phone deliverable. Both startup launches additionally require
the system-navigation registration marker.

These fixtures do not establish logged-in queue mutation, track-page navigation,
all Spotify screens, native ARM, Samsung firmware, or complete visual correctness
on the user's device. The current GitHub Actions emulator has no secure interactive
sign-in handoff. Credentials in chat or workflow secrets would not provide one.

Install requires repatching the original 9.1.94.1929 APK with R16 and replacing
only shuffle-plus with 0.1.4. The other four extensions remain 0.1.7. If a genuine
stale condition occurs, the specific code identifies which guard rejected the
attempt before dispatch. User acceptance must compare the preview with the actual
current song and next three queued songs.
