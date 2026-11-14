# R23 phone acceptance

Emulator checks do not sign into Spotify and cannot confirm real account playback,
Connect, library access or Samsung rendering. Test on the target phone without
sharing credentials. Keep app data while repatching.

| Check | Evidence needed |
| --- | --- |
| Identity | About shows R23; Shuffle+ reports active module R23 |
| Collection shuffle | Prepare/start a small album. Compare current song and every selected upcoming occurrence to the preview. Include a repeated song if possible. |
| Queue shuffle | Turn off Spotify shuffle, preview/confirm the queue, compare order. Current song and history must stay intact. |
| Autoplay | Repeat with your preferred Autoplay setting. Recommendations may follow the complete selection; the preference must be kept. |
| Concurrent edits | Change song or queue after preview. Apply must reject stale state without silently retrying. |
| Unknown result | Inspect Spotify, copy redacted diagnostics before restarting, then explicitly acknowledge the inspected action. |
| Library regression | Load Liked Songs and an album in Sort Play / Playlist Plus. Save a small new copy and compare count/order. Inspect unknown results before saving again. |
| Extensions/settings | Save/reopen Last.fm key and username without including them in reports. Open marketplace, Bookmarks and Beautiful Lyrics. |
| Rendering | Check drawer, header below status bar, mini-player and navigation above gestures. Disable glass to restore surfaces, then background/foreground. |
| Timer | Check native/custom presets, cancellation and expiry. Manager timer recovery after process death is not added in R23. |

Report versions, operation and redacted diagnostics; cover personal screenshot
details. No password, session token or account login is needed by the developer.
