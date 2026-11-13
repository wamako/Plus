# R24 focused phone check

This candidate improves evidence; it is not a confirmed playback fix.
Repatch the original Spotify 9.1.94.1929 ARM64 APK using R24, preserve app data,
replace the Shuffle+ folder with 0.1.13, Refresh and restart. Verify adapter R24.
Suite 0.1.11 contains the same metadata error correction for the other extensions.

1. Inspect the previous unknown action in Spotify, then acknowledge it in Shuffle+.
2. Load the collection and select **Use 20-song test ranges**. Confirm the displayed
   range and count. Prepare, then Start once. The full collection remains loaded.
3. Compare the current song and upcoming songs with that preview. If unconfirmed,
   copy the diagnostics. Check the first mismatch position shown in the message;
   note whether the expected song plays when opened directly in Spotify. Do not
   repeatedly apply the same unknown action.
4. If metadata reports DNS failure, note whether ordinary Spotify streaming works
   on that same connection. Retry the read after connectivity recovers; no saved
   songs should disappear. Do not send credentials or raw session/network logs.

Authenticated playback, Samsung rendering and this phone's network cannot be
established by the logged-out CI environment. Earlier regression checks remain in
[R23 acceptance](R23_ACCEPTANCE.md).
