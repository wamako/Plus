package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.features.ShareTrackingSanitizer;
import org.junit.Test;

import static org.junit.Assert.*;

public class ShareTrackingSanitizerTest {

    @Test
    public void stripsSiAndUtmParamsFromSpotifyUrls() {
        assertEquals(
                "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
                ShareTrackingSanitizer.sanitizeSingleUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abcdef123456")
        );
        assertEquals(
                "https://open.spotify.com/episode/5xyz?t=142",
                ShareTrackingSanitizer.sanitizeSingleUrl("https://open.spotify.com/episode/5xyz?t=142&si=trackMe&utm_source=copy-link")
        );
        assertEquals(
                "https://spotify.link/abcDEF123",
                ShareTrackingSanitizer.sanitizeSingleUrl("https://spotify.link/abcDEF123?si=999&pt=11")
        );
    }

    @Test
    public void leavesNonSpotifyUrlsAndCleanUrlsUntouched() {
        String youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=keepNonSpotify";
        assertEquals(youtube, ShareTrackingSanitizer.sanitizeSingleUrl(youtube));

        String cleanSpotify = "https://open.spotify.com/album/123456";
        assertEquals(cleanSpotify, ShareTrackingSanitizer.sanitizeSingleUrl(cleanSpotify));
    }

    @Test
    public void sanitizesUrlsEmbeddedInsideShareProseWithoutBreakingPunctuation() {
        String input = "Listen to Midnight City! https://open.spotify.com/track/1abc23?si=deadbeef&utm_medium=share.";
        String expected = "Listen to Midnight City! https://open.spotify.com/track/1abc23.";
        assertEquals(expected, ShareTrackingSanitizer.sanitizeText(input));
    }
}
