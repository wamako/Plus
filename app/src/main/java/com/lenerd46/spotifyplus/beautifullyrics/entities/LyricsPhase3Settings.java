package com.lenerd46.spotifyplus.beautifullyrics.entities;

import android.app.Activity;
import android.content.SharedPreferences;
import android.view.Window;
import android.view.WindowManager;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Pure configuration helpers and non-AMOLED palette definitions for Phase 3 Lyrics modes
 * (static palettes, calmer motion mode, and keep-screen-on ownership tracking).
 */
public final class LyricsPhase3Settings {
    public static final String PREF_STATIC_PALETTE = "lyrics_static_palette";
    public static final String PREF_CALMER_MOTION = "lyrics_calmer_motion";
    public static final String PREF_KEEP_SCREEN_ON = "lyrics_keep_screen_on";

    public static final String PALETTE_ARTWORK = "artwork";
    public static final String PALETTE_MIDNIGHT_SLATE = "midnight_slate";
    public static final String PALETTE_WARM_ESPRESSO = "warm_espresso";
    public static final String PALETTE_FOREST_DUSK = "forest_dusk";
    public static final String PALETTE_TWILIGHT_PLUM = "twilight_plum";
    public static final String PALETTE_SPOTIFY_CHARCOAL = "spotify_charcoal";

    public static final int COLOR_CHARCOAL_FLOOR = 0xFF181818;

    public static final class PaletteSpec {
        public final String id;
        public final String label;
        public final int primaryColor;
        public final int secondaryColor;

        PaletteSpec(String id, String label, int primaryColor, int secondaryColor) {
            this.id = id;
            this.label = label;
            this.primaryColor = primaryColor;
            this.secondaryColor = secondaryColor;
        }
    }

    private static final Map<String, PaletteSpec> PALETTES;
    private static final Map<Activity, Boolean> OWNED_KEEP_SCREEN_ON =
            Collections.synchronizedMap(new WeakHashMap<>());

    static {
        Map<String, PaletteSpec> map = new LinkedHashMap<>();
        map.put(PALETTE_ARTWORK, new PaletteSpec(PALETTE_ARTWORK, "Artwork Dynamic", 0xFF181818, 0xFF242424));
        map.put(PALETTE_MIDNIGHT_SLATE, new PaletteSpec(PALETTE_MIDNIGHT_SLATE, "Midnight Slate", 0xFF141923, 0xFF1D2534));
        map.put(PALETTE_WARM_ESPRESSO, new PaletteSpec(PALETTE_WARM_ESPRESSO, "Warm Espresso", 0xFF1E1815, 0xFF2B211C));
        map.put(PALETTE_FOREST_DUSK, new PaletteSpec(PALETTE_FOREST_DUSK, "Forest Dusk", 0xFF121E1A, 0xFF1A2C25));
        map.put(PALETTE_TWILIGHT_PLUM, new PaletteSpec(PALETTE_TWILIGHT_PLUM, "Twilight Plum", 0xFF1C1524, 0xFF281E34));
        map.put(PALETTE_SPOTIFY_CHARCOAL, new PaletteSpec(PALETTE_SPOTIFY_CHARCOAL, "Charcoal Dark", 0xFF181818, 0xFF242424));
        PALETTES = Collections.unmodifiableMap(map);
    }

    private LyricsPhase3Settings() {
    }

    public static Map<String, PaletteSpec> allPalettes() {
        return PALETTES;
    }

    public static String normalizePaletteId(String raw) {
        if (raw == null) return PALETTE_ARTWORK;
        String key = raw.trim().toLowerCase(java.util.Locale.ROOT);
        return PALETTES.containsKey(key) ? key : PALETTE_ARTWORK;
    }

    public static boolean isStaticPalette(String paletteId) {
        return !PALETTE_ARTWORK.equals(normalizePaletteId(paletteId));
    }

    public static PaletteSpec getPaletteSpec(String paletteId) {
        return PALETTES.get(normalizePaletteId(paletteId));
    }

    public static int primaryColorForPalette(String paletteId) {
        return enforceNonAmoledFloor(getPaletteSpec(paletteId).primaryColor);
    }

    public static int secondaryColorForPalette(String paletteId) {
        return enforceNonAmoledFloor(getPaletteSpec(paletteId).secondaryColor);
    }

    /**
     * Prevents true AMOLED pure black (#000000) or near-zero backgrounds by lifting
     * extremely dark RGB triples to a comfortable charcoal floor while preserving alpha.
     */
    public static int enforceNonAmoledFloor(int argb) {
        int a = (argb >>> 24) & 0xFF;
        if (a == 0) a = 0xFF;
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        if (r < 16 && g < 16 && b < 16) {
            return (a << 24) | (COLOR_CHARCOAL_FLOOR & 0x00FFFFFF);
        }
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    public static String getStaticPalette(SharedPreferences prefs) {
        if (prefs == null) return PALETTE_ARTWORK;
        return normalizePaletteId(prefs.getString(PREF_STATIC_PALETTE, PALETTE_ARTWORK));
    }

    public static boolean isCalmerMotion(SharedPreferences prefs) {
        return prefs != null && prefs.getBoolean(PREF_CALMER_MOTION, false);
    }

    public static boolean isKeepScreenOn(SharedPreferences prefs) {
        return prefs == null || prefs.getBoolean(PREF_KEEP_SCREEN_ON, true);
    }

    /**
     * Safely acquires or releases {@link WindowManager.LayoutParams#FLAG_KEEP_SCREEN_ON} for
     * the activity window without clearing a flag already owned by Spotify itself.
     */
    public static void applyKeepScreenOn(Activity activity, boolean keepOn) {
        if (activity == null) return;
        Window window = activity.getWindow();
        if (window == null) return;
        int flags = window.getAttributes() != null ? window.getAttributes().flags : 0;
        boolean currentlyOn = (flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0;
        if (keepOn) {
            if (!currentlyOn) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                OWNED_KEEP_SCREEN_ON.put(activity, Boolean.TRUE);
            }
        } else {
            Boolean owned = OWNED_KEEP_SCREEN_ON.remove(activity);
            if (Boolean.TRUE.equals(owned)) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        }
    }
}
