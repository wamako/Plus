import { normalizeTitleArtistKey } from "./model.mjs";

const INDEX_CACHE_KEY = "@suite/playlist-index-v1";
const INDEX_TTL_MS = 15 * 60 * 1000;

export function matchTrackInCollection(target, tracks) {
  const targetUri = target?.uri || "";
  const targetIsrc = target?.isrc ? String(target.isrc).toUpperCase() : "";
  const targetKey = normalizeTitleArtistKey(target);
  for (const row of tracks || []) {
    if (targetUri && row.uri === targetUri) return { matchType: "exact", matchedTitle: row.title };
    if (targetIsrc && row.isrc && String(row.isrc).toUpperCase() === targetIsrc) {
      return { matchType: "isrc", matchedTitle: row.title };
    }
    if (targetKey && normalizeTitleArtistKey(row) === targetKey) {
      return { matchType: "title-artist", matchedTitle: row.title };
    }
  }
  return null;
}

export async function listLibraryPlaylists(api, job, progress, limitPlaylists = 150) {
  if (typeof api?.Library?.list !== "function") {
    throw new Error("SpotifyPlus Library API is unavailable in this host.");
  }
  const out = [];
  let offset = 0;
  while (out.length < limitPlaylists) {
    if (job?.cancelled) throw new Error("Operation cancelled.");
    progress?.(`Listing your library playlists (${out.length})…`);
    const page = await api.Library.list({ type: "playlist", offset, limit: 50 });
    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      if (item?.uri && /^spotify:playlist:/.test(item.uri)) {
        out.push({ uri: item.uri, name: item.name || item.title || item.uri });
        if (out.length >= limitPlaylists) break;
      }
    }
    const nextOffset = page?.nextOffset;
    if (items.length === 0 || page?.hasNext === false || nextOffset == null || nextOffset <= offset) break;
    offset = nextOffset;
  }
  return out;
}

/**
 * @param {any} client
 * @param {any} targetTrack
 * @param {{ forceRefresh?: boolean, nowMs?: number, limitPlaylists?: number, job?: any, progress?: ((text: string) => void) | null }} [opts]
 */
export async function findPlaylistsContainingTrack(client, targetTrack, {
  forceRefresh = false,
  nowMs = Date.now(),
  limitPlaylists = 120,
  job = null,
  progress = null,
} = {}) {
  const api = client?.api;
  const storage = api?.Platform?.Storage;
  let cached = !forceRefresh ? storage?.get?.(INDEX_CACHE_KEY) : null;
  const fromCache = Boolean(cached && Array.isArray(cached.playlists) && nowMs - (cached.updatedAt || 0) <= INDEX_TTL_MS);
  if (!fromCache) {
    const list = await listLibraryPlaylists(api, job, progress, limitPlaylists);
    const indexed = [];
    for (let i = 0; i < list.length; i++) {
      if (job?.cancelled) throw new Error("Operation cancelled.");
      const pl = list[i];
      progress?.(`Scanning playlist ${i + 1} of ${list.length}: ${pl.name}…`);
      try {
        const col = await client.collection(pl.uri, job, () => {}, {});
        indexed.push({
          uri: pl.uri,
          name: col.name || pl.name,
          count: col.tracks.length,
          tracks: col.tracks.map((t) => ({
            uri: t.uri,
            title: t.title,
            artist: t.artist,
            isrc: t.isrc || "",
          })),
        });
      } catch (error) {
        if (job?.cancelled) throw error;
      }
    }
    cached = { version: 1, updatedAt: nowMs, playlists: indexed };
    try {
      storage?.set?.(INDEX_CACHE_KEY, cached);
    } catch {
      // Cache may exceed pref limits on huge libraries; search results still work in-memory.
    }
  }
  const matches = [];
  for (const pl of cached.playlists) {
    const match = matchTrackInCollection(targetTrack, pl.tracks);
    if (match) {
      matches.push({
        uri: pl.uri,
        name: pl.name,
        trackCount: pl.count ?? pl.tracks.length,
        ...match,
      });
    }
  }
  return {
    scannedPlaylists: cached.playlists.length,
    fromCache,
    matches,
  };
}
