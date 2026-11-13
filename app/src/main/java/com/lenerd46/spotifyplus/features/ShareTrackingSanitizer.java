package com.lenerd46.spotifyplus.features;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure Java sanitizer stripping Spotify share-tracking parameters (?si=, utm_*, pt, pi, etc.)
 * from open.spotify.com, play.spotify.com, spotify.link, spoti.fi, and spotify:// URIs.
 */
public final class ShareTrackingSanitizer {
    public static final String PREF_KEY = "strip_share_tracking_si";

    private static final Set<String> TRACKING_PARAMS = new HashSet<>(Arrays.asList(
            "si", "pt", "pi", "nd", "ref",
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
            "fbclid", "gclid", "mc_cid", "mc_eid", "igshid"
    ));

    private static final Pattern URL_PATTERN = Pattern.compile(
            "(https?://[^\\s<>\"']+|spotify://[^\\s<>\"']+)",
            Pattern.CASE_INSENSITIVE
    );

    private ShareTrackingSanitizer() {
    }

    public static boolean isSpotifyShareUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) return false;
        String lower = rawUrl.toLowerCase(Locale.ROOT);
        if (lower.startsWith("spotify://")) return true;
        try {
            URI uri = URI.create(rawUrl);
            String host = uri.getHost();
            if (host == null) return false;
            String h = host.toLowerCase(Locale.ROOT);
            return h.equals("open.spotify.com")
                    || h.equals("play.spotify.com")
                    || h.equals("spotify.link")
                    || h.equals("spoti.fi")
                    || h.endsWith(".spotify.com");
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    public static String sanitizeSingleUrl(String rawUrl) {
        if (!isSpotifyShareUrl(rawUrl)) return rawUrl;
        int qIndex = rawUrl.indexOf('?');
        if (qIndex < 0) return rawUrl;

        int hashIndex = rawUrl.indexOf('#', qIndex);
        String base = rawUrl.substring(0, qIndex);
        String query = hashIndex >= 0 ? rawUrl.substring(qIndex + 1, hashIndex) : rawUrl.substring(qIndex + 1);
        String fragment = hashIndex >= 0 ? rawUrl.substring(hashIndex) : "";

        if (query.isEmpty()) return base + fragment;

        String[] parts = query.split("&");
        StringBuilder kept = new StringBuilder();
        boolean removedAny = false;
        for (String part : parts) {
            if (part.isEmpty()) continue;
            int eq = part.indexOf('=');
            String name = (eq >= 0 ? part.substring(0, eq) : part).toLowerCase(Locale.ROOT);
            if (TRACKING_PARAMS.contains(name) || name.startsWith("utm_")) {
                removedAny = true;
                continue;
            }
            if (kept.length() > 0) kept.append('&');
            kept.append(part);
        }
        if (!removedAny) return rawUrl;
        if (kept.length() == 0) return base + fragment;
        return base + "?" + kept + fragment;
    }

    public static String sanitizeText(String text) {
        if (text == null || text.isEmpty()) return text;
        if (!text.contains("spotify") && !text.contains("spoti.fi")) return text;

        Matcher matcher = URL_PATTERN.matcher(text);
        StringBuffer sb = null;
        while (matcher.find()) {
            String token = matcher.group(1);
            int trimmedEnd = trimTrailingPunctuationIndex(token);
            String candidate = token.substring(0, trimmedEnd);
            String trailing = token.substring(trimmedEnd);
            String clean = sanitizeSingleUrl(candidate);
            if (!clean.equals(candidate)) {
                if (sb == null) sb = new StringBuffer();
                matcher.appendReplacement(sb, Matcher.quoteReplacement(clean + trailing));
            }
        }
        if (sb == null) return text;
        matcher.appendTail(sb);
        return sb.toString();
    }

    private static int trimTrailingPunctuationIndex(String url) {
        int end = url.length();
        while (end > 0) {
            char last = url.charAt(end - 1);
            if (last == '.' || last == ',' || last == ';' || last == '!' || last == '?' || last == ')' || last == ']') {
                end--;
            } else {
                break;
            }
        }
        return end;
    }
}
