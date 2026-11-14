package com.lenerd46.spotifyplus.beautifullyrics.entities;

import android.content.SharedPreferences;

import java.util.Locale;

/**
 * Persists per-song lyrics sync timing offsets (in milliseconds) in "SpotifyPlus" preferences
 * so user nudges survive restarts and backup/restore cycles.
 */
public final class LyricsOffsetStore {
    public static final String PREF_PREFIX = "lyrics_offset_";
    public static final int MIN_OFFSET_MS = -10000;
    public static final int MAX_OFFSET_MS = 10000;
    public static final int COARSE_STEP_MS = 250;
    public static final int FINE_STEP_MS = 50;

    private LyricsOffsetStore() {
    }

    public static String normalizeTrackKey(String rawUriOrUrl) {
        if (rawUriOrUrl == null) return null;
        String trimmed = rawUriOrUrl.trim();
        if (trimmed.isEmpty()) return null;

        int queryIdx = trimmed.indexOf('?');
        if (queryIdx >= 0) trimmed = trimmed.substring(0, queryIdx);
        int hashIdx = trimmed.indexOf('#');
        if (hashIdx >= 0) trimmed = trimmed.substring(0, hashIdx);

        if (trimmed.startsWith("https://open.spotify.com/") || trimmed.startsWith("http://open.spotify.com/")) {
            String path = trimmed.replaceFirst("^https?://open\\.spotify\\.com/", "");
            String[] parts = path.split("/");
            int offset = (parts.length > 0 && parts[0].startsWith("intl-")) ? 1 : 0;
            if (parts.length - offset >= 2) {
                String type = parts[offset].trim();
                String id = parts[offset + 1].trim();
                if (!type.isEmpty() && !id.isEmpty()) {
                    return "spotify:" + type + ":" + id;
                }
            }
        }
        return trimmed;
    }

    public static int clampOffsetMs(int offsetMs) {
        return Math.max(MIN_OFFSET_MS, Math.min(MAX_OFFSET_MS, offsetMs));
    }

    public static String formatOffsetLabel(int offsetMs) {
        int clamped = clampOffsetMs(offsetMs);
        if (clamped == 0) return "0ms";
        return String.format(Locale.US, "%+dms", clamped);
    }

    public static String prefKeyForTrack(String trackUri) {
        String normalized = normalizeTrackKey(trackUri);
        return normalized == null ? null : PREF_PREFIX + normalized;
    }

    public static int getOffsetMs(SharedPreferences prefs, String trackUri) {
        if (prefs == null) return 0;
        String key = prefKeyForTrack(trackUri);
        if (key == null) return 0;
        return clampOffsetMs(prefs.getInt(key, 0));
    }

    public static int setOffsetMs(SharedPreferences prefs, String trackUri, int offsetMs) {
        int clamped = clampOffsetMs(offsetMs);
        if (prefs == null) return clamped;
        String key = prefKeyForTrack(trackUri);
        if (key == null) return clamped;
        SharedPreferences.Editor editor = prefs.edit();
        if (clamped == 0) {
            editor.remove(key);
        } else {
            editor.putInt(key, clamped);
        }
        editor.apply();
        return clamped;
    }

    public static int nudgeOffsetMs(SharedPreferences prefs, String trackUri, int deltaMs) {
        int current = getOffsetMs(prefs, trackUri);
        return setOffsetMs(prefs, trackUri, current + deltaMs);
    }
}
