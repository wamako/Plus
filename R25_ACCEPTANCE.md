# R25 phone acceptance

Pair the R25 ARM64 module with local suite 0.1.12 and Shuffle+ 0.1.14.
Repatch Spotify 9.1.94.1929 using the existing LSPatch process, preserve app data,
replace extension folders without duplicate IDs, Refresh and restart Spotify.
The module APK is not a standalone Spotify installer.

1. Open Extension settings > About: Extension API should be 2 and Spotify version
   9.1.94.1929. Module version ends in .25.
2. Open Marketplace and a known API 2 extension. The 'supports API 1' warning
   should be gone; Spotify-version warnings may still be correct for other builds.
3. Check catalog, installed list, extension pages and your local extension entries.
   Existing API 1 compatibility extensions should continue to load.
4. Where a Marketplace README/preview contains a GIF or animated WebP, confirm
   it animates while visible. Close and reopen the page to check recovery.
5. Check bookmark labels, saved settings, custom sleep timers and Liquid Glass.
6. Shuffle+ remains diagnostic. Use a small 20-song range and inspect actual playback
   after any command. If order is unconfirmed, retain the diagnostic report; do not
   treat success acknowledgments as proof or automatically repeat an unknown action.

No login/password is needed in chat. Authenticated playback and Samsung-specific
rendering remain phone acceptance, beyond logged-out CI validation.
