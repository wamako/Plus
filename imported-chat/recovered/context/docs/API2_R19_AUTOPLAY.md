# R19 / Shuffle+ 0.1.7: verified selection followed by Autoplay

R18 phone diagnostics showed the correct first URI, four post-dispatch events,
14 requested songs and 58 upcoming items, followed by UNCONFIRMED_ORDER.
The user confirmed **Preview, then extras** and explicitly chose **Keep Autoplay**.
Their report does not identify the providers of those extras. An Autoplay tail
is a supported explanation, not a proven classification of all 58 tracks.

Spotify documents that Autoplay appends similar songs after an album, playlist
or selection: https://support.spotify.com/za-en/article/autoplay/ . R18 compared
every visible upcoming item with the finite preview, so even a correctly ordered
selection followed by normal recommendations could never confirm.

## Change and boundaries

R19 keeps the R18 PlayCommand/context/options unchanged. It adds no new delimiter,
queue write, retry, global setting change or end-of-selection pause. The user's
existing Spotify Autoplay preference remains authoritative.

CollectionOrder reads Spotify's actual ContextTrack URI/provider/metadata fields.
The current URI and every visible requested position must match the exact preview
sequence, including duplicates. Once all requested upcoming positions are present,
additional music is accepted only with provider exactly **autoplay**, a valid
Spotify track URI and no is_queued=true flag. Context, manual-queue, missing or
unknown providers, episodes and other unclassified extras are rejected. A
recommendation with a wrong URI inserted inside the selection cannot be hidden
as an allowed tail. Provider labels do not invalidate a requested song whose URI
already matches its exact selected position; they classify unrequested extras.

Native delimiter forms are recognized only at the expected selection boundary
or the final visible position, with at most one marker. Early/misplaced markers
and missing requested occurrences still fail. For large selections, an exposed
prefix remains visible-window verification, not full-list readback; that prefix
cannot contain extras. Autoplay-tail success requires a complete visible selection.

Confirmed collection results report autoplayTailCount and selectionCompleteInWindow.
The client validates these and the UI identifies recommendations following the
complete selection. It no longer claims that the entire larger queue equals the
finite preview. A provider-aware-autoplay capability plus host 19 prevents mixed
installations from claiming this behavior.

Safe diagnostics add matching/expected upcoming counts, selection completeness,
Autoplay/context/manual/unknown tail counts and delimiter counts. They never
include raw providers, URIs, UIDs, song names, account data or credentials.
Initial-replay rejection, latest post-dispatch confirmation, unknown-action review,
single-use/expiry, native authorization and no automatic mutation retries remain.
Upcoming-queue reshuffling retains its stricter original identity/CAS/history
checks. Other four extensions remain 0.1.7; only Shuffle+ is replaced by its own
separate 0.1.7 package. No playlist or likes are edited.

## Validation

Production JVM tests include the 14-selected/13-upcoming plus 45-Autoplay-tail
shape, duplicate positions, wrong/missing/inserted songs, partial windows,
singletons, early/misplaced delimiters and context/manual/unknown/non-song extras.
The native adapter fixture confirms a typed tail and rejects a context tail;
these are simulations, not an authenticated phone reproduction. Loader/UI/client
checks cover the Autoplay message, result guards and diagnostic privacy.

An eighth Android fixture uses the checksum-pinned original APK. It constructs
actual ProvidedTrack protobufs and passes them through Spotify's own p.xam.a
decoder before the production verifier reads provider/metadata. It accepts a
properly placed Autoplay tail and rejects wrong selected positions and unsafe
extras. Existing native factory serialization, queue models, navigation, glass,
patched startup and storage checks remain. App tests use unrooted ADB; only
disposable fixture provisioning/retrieval uses root. No account/service/playback
call is made by the model/provider fixture.

Results must be recorded before delivery. Generic x86 Android/model tests cannot
prove authenticated Samsung/native ARM playback. Both R19 repatching and Shuffle+
0.1.7 replacement are required. Refresh/restart, inspect playback and acknowledge
the prior unknown action, then test a small album. On failure copy diagnostics
before restarting; the new counts distinguish provider-aware tails from a wrong
or unclassified queue without exporting song/account information.
