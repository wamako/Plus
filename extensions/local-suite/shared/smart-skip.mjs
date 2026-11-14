import { clean } from "./model.mjs";

const SMART_SKIP_KEY = "@suite/smart-skip-v1";
const MAX_TRASH_ITEMS = 500;
const MAX_ARTIST_BANS = 200;

export const KEYWORD_PRESETS = [
  {
    id: "live",
    label: "Live / Concert versions",
    pattern:
      /(\([^)]*\blive\b[^)]*\)|\[[^\]]*\blive\b[^\]]*\]|\s[-\u2013\u2014]\s[^\n]*\blive\b|\blive\s+(at|in|from|version|session)\b)/i,
  },
  {
    id: "remix",
    label: "Remixes / Club Edits",
    pattern: /\b(remix|rework|vip mix|club mix|radio edit)\b/i,
  },
  {
    id: "sped_up",
    label: "Sped Up / Nightcore",
    pattern: /\b(sped\s*up|speed\s*up|nightcore)\b/i,
  },
  {
    id: "slowed",
    label: "Slowed / Reverb",
    pattern: /\b(slowed(\s*\+\s*reverb)?|slowed\s+down)\b/i,
  },
  {
    id: "acoustic",
    label: "Acoustic / Unplugged",
    pattern: /\b(acoustic|unplugged|stripped)\b/i,
  },
  {
    id: "instrumental",
    label: "Instrumental / Karaoke",
    pattern: /\b(instrumental|karaoke|off\s*vocal|minus\s*one)\b/i,
  },
  {
    id: "acapella",
    label: "Acapella versions",
    pattern: /\b(a\s*cappella|acapella)\b/i,
  },
];

export const DEFAULT_SMART_SKIP_STATE = {
  enabled: true,
  autoTrashEnabled: false,
  autoTrashThreshold: 3,
  activePresets: {},
  customKeywords: [],
  trashedTracks: {},
  bannedArtists: {},
  skipStreaks: {},
};

export function clampAutoTrashThreshold(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 3;
  return Math.max(2, Math.min(10, n));
}

function cloneDefaultSmartSkipState() {
  return {
    ...DEFAULT_SMART_SKIP_STATE,
    activePresets: {},
    customKeywords: [],
    trashedTracks: {},
    bannedArtists: {},
    skipStreaks: {},
  };
}

export class SmartSkipStore {
  constructor(storage) {
    this.storage = storage;
  }

  readState() {
    try {
      const raw = this.storage?.get?.(SMART_SKIP_KEY);
      if (!raw || typeof raw !== "object") {
        return cloneDefaultSmartSkipState();
      }
      return {
        enabled: raw.enabled !== false,
        autoTrashEnabled: raw.autoTrashEnabled === true,
        autoTrashThreshold: clampAutoTrashThreshold(raw.autoTrashThreshold),
        activePresets:
          raw.activePresets && typeof raw.activePresets === "object"
            ? { ...raw.activePresets }
            : {},
        customKeywords: Array.isArray(raw.customKeywords)
          ? raw.customKeywords.map((k) => String(k || "").trim()).filter(Boolean).slice(0, 40)
          : [],
        trashedTracks:
          raw.trashedTracks && typeof raw.trashedTracks === "object"
            ? { ...raw.trashedTracks }
            : {},
        bannedArtists:
          raw.bannedArtists && typeof raw.bannedArtists === "object"
            ? { ...raw.bannedArtists }
            : {},
        skipStreaks:
          raw.skipStreaks && typeof raw.skipStreaks === "object"
            ? { ...raw.skipStreaks }
            : {},
      };
    } catch {
      return cloneDefaultSmartSkipState();
    }
  }

  writeState(next) {
    const copy = {
      ...next,
      autoTrashThreshold: clampAutoTrashThreshold(next.autoTrashThreshold),
    };
    this.storage?.set?.(SMART_SKIP_KEY, copy);
    return copy;
  }

  setEnabled(enabled) {
    const state = this.readState();
    state.enabled = Boolean(enabled);
    return this.writeState(state);
  }

  /**
   * @param {boolean} enabled
   * @param {number} [threshold]
   */
  setAutoTrash(enabled, threshold = undefined) {
    const state = this.readState();
    state.autoTrashEnabled = Boolean(enabled);
    if (threshold !== undefined) {
      state.autoTrashThreshold = clampAutoTrashThreshold(threshold);
    }
    return this.writeState(state);
  }

  togglePreset(presetId, enabled) {
    const state = this.readState();
    if (enabled) state.activePresets[presetId] = true;
    else delete state.activePresets[presetId];
    return this.writeState(state);
  }

  setCustomKeywords(csvOrList) {
    const list = Array.isArray(csvOrList)
      ? csvOrList
      : String(csvOrList || "").split(/[,;\n]+/);
    const normalized = [
      ...new Set(list.map((s) => s.trim()).filter(Boolean)),
    ].slice(0, 40);
    const state = this.readState();
    state.customKeywords = normalized;
    return this.writeState(state);
  }

  trashTrack(track, reason = "manual") {
    if (!track?.uri || !/^spotify:track:/.test(track.uri)) return this.readState();
    const state = this.readState();
    const entries = { ...state.trashedTracks };
    entries[track.uri] = {
      uri: track.uri,
      title: String(track.title || track.name || track.uri),
      artist: String(track.artist || ""),
      reason: String(reason || "manual"),
      trashedAt: Date.now(),
    };
    const keys = Object.keys(entries);
    if (keys.length > MAX_TRASH_ITEMS) {
      keys
        .sort((a, b) => (entries[a]?.trashedAt || 0) - (entries[b]?.trashedAt || 0))
        .slice(0, keys.length - MAX_TRASH_ITEMS)
        .forEach((oldKey) => delete entries[oldKey]);
    }
    state.trashedTracks = entries;
    delete state.skipStreaks[track.uri];
    return this.writeState(state);
  }

  restoreTrack(uri) {
    if (!uri) return this.readState();
    const state = this.readState();
    delete state.trashedTracks[uri];
    delete state.skipStreaks[uri];
    return this.writeState(state);
  }

  clearTrash() {
    const state = this.readState();
    state.trashedTracks = {};
    return this.writeState(state);
  }

  banArtist(artistName) {
    const norm = clean(artistName);
    if (!norm) return this.readState();
    const state = this.readState();
    const keys = Object.keys(state.bannedArtists);
    if (keys.length >= MAX_ARTIST_BANS && !state.bannedArtists[norm]) {
      delete state.bannedArtists[keys[0]];
    }
    state.bannedArtists[norm] = {
      name: String(artistName).trim(),
      bannedAt: Date.now(),
    };
    return this.writeState(state);
  }

  unbanArtist(artistKeyOrName) {
    const norm = clean(artistKeyOrName);
    const state = this.readState();
    delete state.bannedArtists[artistKeyOrName];
    if (norm) delete state.bannedArtists[norm];
    return this.writeState(state);
  }

  recordManualSkip(track) {
    if (!track?.uri || !/^spotify:track:/.test(track.uri)) {
      return { trashed: false, count: 0, state: this.readState() };
    }
    const state = this.readState();
    if (!state.autoTrashEnabled || state.trashedTracks[track.uri]) {
      return { trashed: false, count: 0, state };
    }
    const nextCount = (Number(state.skipStreaks[track.uri]) || 0) + 1;
    const threshold = clampAutoTrashThreshold(state.autoTrashThreshold);
    if (nextCount >= threshold) {
      state.trashedTracks[track.uri] = {
        uri: track.uri,
        title: String(track.title || track.name || track.uri),
        artist: String(track.artist || ""),
        reason: `auto-skipped ${nextCount}x`,
        trashedAt: Date.now(),
      };
      delete state.skipStreaks[track.uri];
      return { trashed: true, count: nextCount, state: this.writeState(state) };
    }
    state.skipStreaks[track.uri] = nextCount;
    return { trashed: false, count: nextCount, state: this.writeState(state) };
  }

  resetSkipStreak(uri) {
    if (!uri) return;
    const state = this.readState();
    if (!state.skipStreaks[uri]) return;
    delete state.skipStreaks[uri];
    this.writeState(state);
  }
}

export function extractTrackArtists(track) {
  const list = [];
  if (Array.isArray(track?.artists)) {
    for (const a of track.artists) {
      const name = typeof a === "string" ? a : a?.name || "";
      if (name.trim()) list.push(name.trim());
    }
  }
  if (!list.length && typeof track?.artist === "string" && track.artist.trim()) {
    for (const part of track.artist.split(",")) {
      if (part.trim()) list.push(part.trim());
    }
  }
  return list;
}

export function evaluateTrackAutoSkip(state, track) {
  if (!state?.enabled || !track?.uri) {
    return { skip: false, reason: "" };
  }
  if (state.trashedTracks?.[track.uri]) {
    return { skip: true, reason: "Trashbin", detail: state.trashedTracks[track.uri].reason };
  }

  const artists = extractTrackArtists(track);
  for (const name of artists) {
    const key = clean(name);
    if (key && state.bannedArtists?.[key]) {
      return { skip: true, reason: "Banned Artist", detail: name };
    }
  }

  const title = String(track.title || track.name || "");
  const albumTitle =
    typeof track.album === "string"
      ? track.album
      : String(track.album?.title || track.album?.name || "");
  const haystack = `${title} ${albumTitle}`.trim();

  for (const preset of KEYWORD_PRESETS) {
    if (state.activePresets?.[preset.id] && preset.pattern.test(haystack)) {
      return { skip: true, reason: preset.label, detail: preset.id };
    }
  }

  const lowerHaystack = clean(haystack);
  for (const rawKw of state.customKeywords || []) {
    const kw = clean(rawKw);
    if (kw && lowerHaystack.includes(kw)) {
      return { skip: true, reason: `Keyword: ${rawKw}`, detail: kw };
    }
  }

  return { skip: false, reason: "" };
}

export function stripVersionSuffixes(rawTitle) {
  let title = String(rawTitle || "").trim();
  const variantPattern =
    /\s*(\(([^)]*(live|remix|rework|edit|remaster|deluxe|version|mix|sped up|slowed|nightcore|acoustic|unplugged|stripped|instrumental|karaoke|acapella|a cappella|feat\.?|ft\.?|with )[^)]*)\)|\[([^\]]*(live|remix|rework|edit|remaster|deluxe|version|mix|sped up|slowed|nightcore|acoustic|unplugged|stripped|instrumental|karaoke|acapella|a cappella|feat\.?|ft\.?)[^\]]*)\]|\s[-\u2013\u2014]\s*(?:19\d\d|20\d\d)?\s*(?:remaster(?:ed)?|live(?:\s+at\b.*)?|remix.*|radio edit.*|sped up.*|slowed.*|acoustic.*|instrumental.*|karaoke.*|version.*|deluxe.*|single version.*|album version.*).*)$/gi;
  let prev;
  do {
    prev = title;
    title = title.replace(variantPattern, "").trim();
  } while (title !== prev);
  return title || String(rawTitle || "").trim();
}

export function buildStudioSearchQuery(track) {
  const title = stripVersionSuffixes(track?.title || track?.name || "");
  const artists = extractTrackArtists(track);
  const primaryArtist = artists[0]
    ? artists[0].replace(/\s*(feat\.?|ft\.?).*$/i, "").trim()
    : "";
  return [title, primaryArtist].filter(Boolean).join(" ").trim();
}

const VARIANT_PENALTY_RE =
  /\b(live|remix|rework|sped\s*up|speed\s*up|slowed|nightcore|karaoke|instrumental|acapella|a\s*cappella|unplugged|acoustic|demo)\b/i;

export function rankStudioCandidates(tracks, sourceTrack) {
  const targetTitle = clean(stripVersionSuffixes(sourceTrack?.title || sourceTrack?.name || ""));
  const sourceArtists = new Set(extractTrackArtists(sourceTrack).map(clean).filter(Boolean));

  return (tracks || [])
    .filter((candidate) => candidate?.uri && candidate.uri !== sourceTrack?.uri)
    .map((candidate) => {
      const rawTitle = String(candidate.title || candidate.name || "");
      const candBaseTitle = clean(stripVersionSuffixes(rawTitle));
      const candArtists = extractTrackArtists(candidate).map(clean);
      let score = 0;

      if (candBaseTitle === targetTitle) score += 50;
      else if (targetTitle && candBaseTitle.includes(targetTitle)) score += 20;

      if (candArtists.some((a) => sourceArtists.has(a))) score += 35;

      if (VARIANT_PENALTY_RE.test(rawTitle)) score -= 45;
      else score += 25;

      if (clean(rawTitle) === targetTitle) score += 15;

      return { track: candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.track);
}
