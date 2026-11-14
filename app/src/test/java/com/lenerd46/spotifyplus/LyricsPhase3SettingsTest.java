package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.beautifullyrics.entities.LyricsOffsetStore;
import com.lenerd46.spotifyplus.beautifullyrics.entities.LyricsPhase3Settings;
import org.junit.Test;

import static org.junit.Assert.*;

public class LyricsPhase3SettingsTest {

    @Test
    public void staticPalettesNeverContainAmoledPureBlack() {
        for (LyricsPhase3Settings.PaletteSpec spec : LyricsPhase3Settings.allPalettes().values()) {
            assertNotEquals("Palette " + spec.id + " must not use #000000 primary", 0xFF000000, spec.primaryColor);
            assertNotEquals("Palette " + spec.id + " must not use #000000 secondary", 0xFF000000, spec.secondaryColor);
            int pR = (spec.primaryColor >> 16) & 0xFF;
            int pG = (spec.primaryColor >> 8) & 0xFF;
            int pB = spec.primaryColor & 0xFF;
            assertTrue("Palette " + spec.id + " must stay above AMOLED near-black floor", pR >= 16 || pG >= 16 || pB >= 16);
        }
        assertEquals(LyricsPhase3Settings.COLOR_CHARCOAL_FLOOR, LyricsPhase3Settings.enforceNonAmoledFloor(0xFF000000));
        assertEquals(LyricsPhase3Settings.COLOR_CHARCOAL_FLOOR, LyricsPhase3Settings.enforceNonAmoledFloor(0xFF040404));
        assertEquals(0xFF281E34, LyricsPhase3Settings.enforceNonAmoledFloor(0xFF281E34));
    }

    @Test
    public void paletteNormalizationAndLookupHandleInvalidValuesSafely() {
        assertEquals(LyricsPhase3Settings.PALETTE_ARTWORK, LyricsPhase3Settings.normalizePaletteId(null));
        assertEquals(LyricsPhase3Settings.PALETTE_ARTWORK, LyricsPhase3Settings.normalizePaletteId("amoled"));
        assertFalse(LyricsPhase3Settings.isStaticPalette("artwork"));
        assertTrue(LyricsPhase3Settings.isStaticPalette("Midnight_Slate"));
        assertEquals(0xFF141923, LyricsPhase3Settings.primaryColorForPalette("MIDNIGHT_SLATE"));
    }

    @Test
    public void offsetStoreNormalizesUrlsClampsBoundsAndFormatsLabels() {
        assertEquals("spotify:track:6rqhFgbbKwnb9MLmUQDhG6",
                LyricsOffsetStore.normalizeTrackKey("https://open.spotify.com/intl-ja/track/6rqhFgbbKwnb9MLmUQDhG6?si=abc123"));
        assertEquals("spotify:track:abc123",
                LyricsOffsetStore.normalizeTrackKey("spotify:track:abc123?si=xyz"));
        assertNull(LyricsOffsetStore.normalizeTrackKey("   "));

        assertEquals(LyricsOffsetStore.MIN_OFFSET_MS, LyricsOffsetStore.clampOffsetMs(-999999));
        assertEquals(LyricsOffsetStore.MAX_OFFSET_MS, LyricsOffsetStore.clampOffsetMs(999999));
        assertEquals("0ms", LyricsOffsetStore.formatOffsetLabel(0));
        assertEquals("+250ms", LyricsOffsetStore.formatOffsetLabel(250));
        assertEquals("-150ms", LyricsOffsetStore.formatOffsetLabel(-150));
    }
}
