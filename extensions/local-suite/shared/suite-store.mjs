import { finite, clean } from "./model.mjs";

const RATINGS_KEY = "@suite/track-ratings-v1";
const STATS_SUMMARY_KEY = "@suite/listening-stats-summary-v1";
const BOOKMARKS_KEY = "@suite/bookmarks-v1";
const OUTRO_KEY = "@suite/outro-skips-v1";
const MAX_BOOKMARKS = 500;
const MAX_STATS_TRACKS = 5000;

function readObj(storage, key, fallback = {}) {
  try {
    const value = storage?.get?.(key);
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readList(storage, key) {
  try {
    const value = storage?.get?.(key);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export class RatingsStore {
  constructor(storage) {
    this.storage = storage;
  }
  all() {
    const raw = readObj(this.storage, RATINGS_KEY, {});
    const entries = raw.entries && typeof raw.entries === "object" ? raw.entries : raw;
    return entries && typeof entries === "object" ? entries : {};
  }
  get(uri) {
    if (!uri) return null;
    const entry = this.all()[uri];
    const score = finite(typeof entry === "number" ? entry : entry?.rating);
    return score != null && score >= 1 && score <= 10 ? score : null;
  }
  set(uri, rating, meta = {}) {
    if (!uri) throw new Error("Track URI is required.");
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      throw new Error("Rating must be an integer from 1 to 10.");
    }
    const entries = { ...this.all() };
    entries[uri] = {
      rating: score,
      title: String(meta.title || entries[uri]?.title || ""),
      artist: String(meta.artist || entries[uri]?.artist || ""),
      updatedAt: Date.now(),
    };
    this.storage.set(RATINGS_KEY, { version: 1, entries });
    return entries[uri];
  }
  clear(uri) {
    if (!uri) return;
    const entries = { ...this.all() };
    delete entries[uri];
    this.storage.set(RATINGS_KEY, { version: 1, entries });
  }
  count() {
    return Object.keys(this.all()).length;
  }
}

export class StatsBridge {
  constructor(storage) {
    this.storage = storage;
  }
  readSummary() {
    const raw = readObj(this.storage, STATS_SUMMARY_KEY, { version: 1, updatedAt: 0, tracks: {} });
    return {
      updatedAt: finite(raw.updatedAt) || 0,
      tracks: raw.tracks && typeof raw.tracks === "object" ? raw.tracks : {},
    };
  }
  syncFromEvents(events, nowMs = Date.now()) {
    const byUri = new Map();
    for (const row of events || []) {
      const uri = row?.uri;
      if (!uri || !/^spotify:track:/.test(uri)) continue;
      const ms = Number(row.listenedMs) || 0;
      const started = Number(row.startedAt) || 0;
      const prev = byUri.get(uri) || {
        uri,
        title: row.title || "",
        artist: row.artist || "",
        count: 0,
        lastPlayed: 0,
        listenedMs: 0,
      };
      if (row.play) prev.count += 1;
      prev.listenedMs += ms;
      if (started > prev.lastPlayed) prev.lastPlayed = started;
      if (!prev.title && row.title) prev.title = row.title;
      if (!prev.artist && row.artist) prev.artist = row.artist;
      byUri.set(uri, prev);
    }
    const sorted = [...byUri.values()]
      .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
      .slice(0, MAX_STATS_TRACKS);
    const tracks = {};
    for (const item of sorted) {
      tracks[item.uri] = {
        count: item.count,
        lastPlayed: item.lastPlayed || null,
        listenedMs: item.listenedMs,
        title: item.title,
        artist: item.artist,
      };
    }
    const payload = { version: 1, updatedAt: nowMs, tracks };
    try {
      this.storage.set(STATS_SUMMARY_KEY, payload);
    } catch {
      // Summary bridge is best-effort and must not disrupt stats polling.
    }
    return payload;
  }
  hydrateTracks(tracks, ratingsStore = new RatingsStore(this.storage)) {
    const summary = this.readSummary().tracks;
    const ratings = ratingsStore.all();
    return (tracks || []).map((track) => {
      const stat = summary[track.uri];
      const rateEntry = ratings[track.uri];
      const rating = finite(typeof rateEntry === "number" ? rateEntry : rateEntry?.rating);
      return {
        ...track,
        playCount: track.playCount ?? (stat ? finite(stat.count) : null),
        lastPlayed: track.lastPlayed ?? (stat ? finite(stat.lastPlayed) : null),
        rating: track.rating ?? (rating != null && rating >= 1 && rating <= 10 ? rating : null),
      };
    });
  }
  forgottenFavorites(days = 30, nowMs = Date.now(), ratingsStore = new RatingsStore(this.storage)) {
    const cutoff = nowMs - Math.max(1, days) * 86400000;
    const summary = this.readSummary().tracks;
    const ratings = ratingsStore.all();
    const seen = new Set([...Object.keys(summary), ...Object.keys(ratings)]);
    const results = [];
    for (const uri of seen) {
      const stat = summary[uri] || {};
      const rateEntry = ratings[uri];
      const rating = finite(typeof rateEntry === "number" ? rateEntry : rateEntry?.rating);
      const count = finite(stat.count) || 0;
      const last = finite(stat.lastPlayed);
      const qualifies = (rating != null && rating >= 7 && (last == null || last < cutoff)) ||
        (count >= 2 && last != null && last < cutoff);
      if (!qualifies) continue;
      results.push({
        uri,
        title: stat.title || rateEntry?.title || uri,
        artist: stat.artist || rateEntry?.artist || "",
        count,
        rating,
        lastPlayed: last,
        daysAgo: last != null ? Math.floor((nowMs - last) / 86400000) : null,
      });
    }
    return results.sort(
      (a, b) => (b.rating || 0) - (a.rating || 0) || b.count - a.count || clean(a.title).localeCompare(clean(b.title)),
    );
  }
}

export class BookmarksStore {
  constructor(storage) {
    this.storage = storage;
  }
  all() {
    return readList(this.storage, BOOKMARKS_KEY);
  }
  forTrack(uri) {
    return uri ? this.all().filter((item) => item?.uri === uri) : this.all();
  }
  add({ uri, title = "", artist = "", positionMs, note = "" }) {
    if (!uri) throw new Error("Track URI is required.");
    const pos = Math.max(0, Math.floor(Number(positionMs) || 0));
    const entry = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      uri,
      title: String(title),
      artist: String(artist),
      positionMs: pos,
      note: String(note || "").trim().slice(0, 120),
      createdAt: Date.now(),
    };
    const next = [entry, ...this.all()].slice(0, MAX_BOOKMARKS);
    this.storage.set(BOOKMARKS_KEY, next);
    return entry;
  }
  remove(id) {
    const next = this.all().filter((item) => item?.id !== id);
    this.storage.set(BOOKMARKS_KEY, next);
    return next;
  }
  allOutros() {
    const raw = readObj(this.storage, OUTRO_KEY, {});
    return raw.entries && typeof raw.entries === "object" ? raw.entries : raw;
  }
  getOutro(uri) {
    if (!uri) return null;
    const entry = this.allOutros()[uri];
    const ms = finite(typeof entry === "number" ? entry : entry?.outroMs);
    return ms != null && ms > 0 ? ms : null;
  }
  setOutro(uri, outroMs, meta = {}) {
    if (!uri) throw new Error("Track URI is required.");
    const ms = Math.floor(Number(outroMs));
    if (!Number.isFinite(ms) || ms < 5000) {
      throw new Error("Outro skip timestamp must be at least 5 seconds.");
    }
    const entries = { ...this.allOutros() };
    entries[uri] = {
      outroMs: ms,
      title: String(meta.title || ""),
      artist: String(meta.artist || ""),
      updatedAt: Date.now(),
    };
    this.storage.set(OUTRO_KEY, { version: 1, entries });
    return entries[uri];
  }
  clearOutro(uri) {
    if (!uri) return;
    const entries = { ...this.allOutros() };
    delete entries[uri];
    this.storage.set(OUTRO_KEY, { version: 1, entries });
  }
}
