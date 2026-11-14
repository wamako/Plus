package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.beautifullyrics.entities.Spline;
import com.lenerd46.spotifyplus.beautifullyrics.entities.SyllableVocals;
import com.lenerd46.spotifyplus.features.GlassBackdrop;
import org.junit.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.Assert.*;

public class SmoothnessImprovementsTest {

    @Test
    public void precomputedSyllableSplinesMatchExpectedBoundariesAndMidpoints() throws Exception {
        String[] splineFields = {
                "SCALE_SPLINE",
                "EMPHASISED_SCALE_SPLINE",
                "Y_OFFSET_APPLE_SPLINE",
                "Y_OFFSET_DEFAULT_SPLINE",
                "GLOW_SPLINE"
        };
        for (String name : splineFields) {
            Field f = SyllableVocals.class.getDeclaredField(name);
            f.setAccessible(true);
            Spline s1 = (Spline) f.get(null);
            Spline s2 = (Spline) f.get(null);
            assertNotNull("Spline " + name + " must be precomputed", s1);
            assertSame("Spline " + name + " must be a cached singleton", s1, s2);
        }

        Field scaleField = SyllableVocals.class.getDeclaredField("SCALE_SPLINE");
        scaleField.setAccessible(true);
        Spline scaleSpline = (Spline) scaleField.get(null);
        assertEquals(1.0, scaleSpline.at(0.0), 1e-4);
        assertEquals(1.03, scaleSpline.at(0.7), 1e-3);
        assertEquals(1.0, scaleSpline.at(1.0), 1e-4);

        Field yOffsetDefaultField = SyllableVocals.class.getDeclaredField("Y_OFFSET_DEFAULT_SPLINE");
        yOffsetDefaultField.setAccessible(true);
        Spline yOffsetSpline = (Spline) yOffsetDefaultField.get(null);
        assertEquals(0.01, yOffsetSpline.at(0.0), 1e-4);
        assertEquals(-1.0 / 60.0, yOffsetSpline.at(0.9), 1e-3);
        assertEquals(0.0, yOffsetSpline.at(1.0), 1e-4);
    }

    @Test
    public void glassBackdropSeparableBoxFilterMatchesReferenceChannelAverages() throws Exception {
        Method avgH = GlassBackdrop.class.getDeclaredMethod("averageHorizontal", int[].class, int.class, int.class, int.class);
        Method avgV = GlassBackdrop.class.getDeclaredMethod("averageVertical", int[].class, int.class, int.class, int.class, int.class);
        avgH.setAccessible(true);
        avgV.setAccessible(true);

        int w = 12, h = 10;
        int[] pixels = new int[w * h];
        for (int i = 0; i < pixels.length; i++) {
            int a = (i * 17) & 0xFF;
            int r = (i * 31 + 11) & 0xFF;
            int g = (i * 53 + 29) & 0xFF;
            int b = (i * 79 + 47) & 0xFF;
            pixels[i] = (a << 24) | (r << 16) | (g << 8) | b;
        }

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int actualH = (int) avgH.invoke(null, pixels, y * w, w, x);
                int expectedH = referenceAverage(pixels, w, h, x, y, true);
                assertEquals("Horizontal blur mismatch at (" + x + "," + y + ")", expectedH, actualH);

                int actualV = (int) avgV.invoke(null, pixels, w, h, x, y);
                int expectedV = referenceAverage(pixels, w, h, x, y, false);
                assertEquals("Vertical blur mismatch at (" + x + "," + y + ")", expectedV, actualV);
            }
        }
    }

    private static int referenceAverage(int[] pixels, int w, int h, int x, int y, boolean horizontal) {
        int a = 0, r = 0, g = 0, b = 0;
        for (int d = -3; d <= 3; d++) {
            int cy = Math.max(0, Math.min(h - 1, y + (horizontal ? 0 : d)));
            int cx = Math.max(0, Math.min(w - 1, x + (horizontal ? d : 0)));
            int p = pixels[cy * w + cx];
            a += (p >>> 24);
            r += (p >> 16) & 0xFF;
            g += (p >> 8) & 0xFF;
            b += p & 0xFF;
        }
        return ((a / 7) << 24) | ((r / 7) << 16) | ((g / 7) << 8) | (b / 7);
    }

    @Test
    public void referencesStrongFontRetentionPreventsClearing() throws Exception {
        References.setBeautifulFont(null);
        assertNotNull(References.beautifulFont);
        assertNull(References.beautifulFont.get());
    }
}
