package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.beautifullyrics.entities.LyricShareHelper;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.*;

public class LyricShareHelperTest {

    @Test
    public void formatsMultiLineQuoteWithAttributionSafely() {
        String quote = LyricShareHelper.formatQuoteText(
                Arrays.asList("  Running up that road  ", "", "Running up that hill"),
                "Running Up That Hill",
                "Kate Bush"
        );
        assertEquals(
                "\"Running up that road\nRunning up that hill\"\n\u2014 Running Up That Hill \u2022 Kate Bush",
                quote
        );
    }

    @Test
    public void handlesMissingMetadataAndFileNameSanitization() {
        assertEquals("\"Just a line\"", LyricShareHelper.formatQuoteText(
                Collections.singletonList("Just a line"), "", null));
        assertEquals("spotifyplus_lyric_midnight_city_m83.png",
                LyricShareHelper.sanitizeFileStem("Midnight City! (M83)"));
        assertEquals("spotifyplus_lyric_quote.png",
                LyricShareHelper.sanitizeFileStem("   "));
    }
}
