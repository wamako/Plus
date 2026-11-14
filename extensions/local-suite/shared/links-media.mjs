import { extractTrackArtists } from "./smart-skip.mjs";

const SONGLINK_CACHE_NS = "@suite/songlink-cache-v1";
const TRACK_URI_RE = /^spotify:track:([A-Za-z0-9]{22})$/;
const PLATFORM_LABELS = [
  ["youtubeMusic", "YouTube Music"],
  ["youtube", "YouTube"],
  ["appleMusic", "Apple Music"],
  ["tidal", "TIDAL"],
  ["deezer", "Deezer"],
  ["soundcloud", "SoundCloud"],
  ["amazonMusic", "Amazon Music"],
];

export function spotifyTrackUrl(uriOrUrl) {
  const raw = String(uriOrUrl || "").trim();
  const match = TRACK_URI_RE.exec(raw);
  if (match) return `https://open.spotify.com/track/${match[1]}`;
  try {
    const parsed = new URL(raw);
    if (/^(?:open|play)\.spotify\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0]?.startsWith("intl-")) parts.shift();
      if (parts[0] === "track" && /^[A-Za-z0-9]{22}$/.test(parts[1] || "")) {
        return `https://open.spotify.com/track/${parts[1]}`;
      }
    }
  } catch {
    // Ignore malformed URLs.
  }
  return "";
}

export function songlinkApiUrl(spotifyUrl) {
  const cleanUrl = spotifyTrackUrl(spotifyUrl) || String(spotifyUrl || "").trim();
  if (!cleanUrl) return "";
  return `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(cleanUrl)}&userCountry=US`;
}

export function sanitizeExternalUrl(raw) {
  try {
    const parsed = new URL(String(raw || "").trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

export function extractPlatformLinks(payload) {
  if (!payload || typeof payload !== "object") {
    return { pageUrl: "", platforms: [] };
  }
  const pageUrl = sanitizeExternalUrl(payload.pageUrl);
  const byPlatform = payload.linksByPlatform || {};
  const platforms = [];
  for (const [key, label] of PLATFORM_LABELS) {
    const url = sanitizeExternalUrl(byPlatform?.[key]?.url);
    if (url) {
      platforms.push({ id: key, label, url });
    }
  }
  return { pageUrl, platforms };
}

/**
 * @param {string} trackUriOrUrl
 * @param {any} [storage]
 * @param {any} [fetchImpl]
 */
export async function fetchUniversalLinks(
  trackUriOrUrl,
  storage = null,
  fetchImpl = globalThis.fetch,
) {
  const canonicalUrl = spotifyTrackUrl(trackUriOrUrl);
  if (!canonicalUrl) {
    throw new Error("A valid Spotify track link or URI is required.");
  }
  const cacheKey = `${SONGLINK_CACHE_NS}:${canonicalUrl}`;
  const now = Date.now();
  try {
    const cached = storage?.get?.(cacheKey);
    if (cached?.data && now - (cached.savedAt || 0) < 7 * 86400000) {
      return { ...cached.data, fromCache: true };
    }
  } catch {
    // Cache read error should not block live fetch.
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Network fetch is unavailable in this environment.");
  }

  const endpoint = songlinkApiUrl(canonicalUrl);
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response?.ok) {
    throw new Error(`Song.link returned HTTP ${response?.status || "error"}`);
  }
  const payload = await response.json();
  const extracted = extractPlatformLinks(payload);
  if (!extracted.pageUrl && !extracted.platforms.length) {
    throw new Error("Song.link returned no cross-platform matches.");
  }

  try {
    storage?.set?.(cacheKey, { savedAt: now, data: extracted });
  } catch {
    // Non-fatal cache write failure.
  }
  return { ...extracted, fromCache: false };
}

export function youtubeVideoSearchUrl(track) {
  const title = String(track?.title || track?.name || "").trim();
  const artist = extractTrackArtists(track)[0] || "";
  const query = [title, artist, "official music video"]
    .filter(Boolean)
    .join(" ")
    .trim();
  return query
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    : "https://www.youtube.com/";
}
