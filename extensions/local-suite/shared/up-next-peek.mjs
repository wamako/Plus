import { clean, finite } from "./model.mjs";

const PEEK_PREFS_KEY = "@suite/up-next-peek-v1";

export const DEFAULT_PEEK_SETTINGS = {
  enabled: true,
  leadSeconds: 15,
  toastOnEnter: true,
};

export function clampLeadSeconds(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_PEEK_SETTINGS.leadSeconds;
  return Math.max(5, Math.min(30, n));
}

export class UpNextPeekStore {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    try {
      const saved = this.storage?.get?.(PEEK_PREFS_KEY);
      if (!saved || typeof saved !== "object") return { ...DEFAULT_PEEK_SETTINGS };
      return {
        enabled: saved.enabled !== false,
        leadSeconds: clampLeadSeconds(saved.leadSeconds),
        toastOnEnter: saved.toastOnEnter !== false,
      };
    } catch {
      return { ...DEFAULT_PEEK_SETTINGS };
    }
  }

  saveSettings(patch = {}) {
    const next = {
      ...this.getSettings(),
      ...patch,
    };
    next.enabled = next.enabled !== false;
    next.leadSeconds = clampLeadSeconds(next.leadSeconds);
    next.toastOnEnter = next.toastOnEnter !== false;
    this.storage?.set?.(PEEK_PREFS_KEY, next);
    return next;
  }
}

export function extractEntryTitle(entry) {
  if (!entry || typeof entry !== "object") return "";
  return String(
    entry.title ||
      entry.name ||
      entry.metadata?.title ||
      entry.metadata?.name ||
      "",
  ).trim();
}

export function extractEntryArtist(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (typeof entry.artist === "string" && entry.artist.trim()) {
    return entry.artist.trim();
  }
  if (typeof entry.artistName === "string" && entry.artistName.trim()) {
    return entry.artistName.trim();
  }
  if (entry.metadata) {
    const metaArtist =
      entry.metadata.artist_name ||
      entry.metadata.artist ||
      entry.metadata.artists;
    if (typeof metaArtist === "string" && metaArtist.trim()) {
      return metaArtist.trim();
    }
  }
  if (Array.isArray(entry.artists)) {
    const names = entry.artists
      .map((a) => (typeof a === "string" ? a : a?.name || ""))
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }
  return "";
}

/**
 * Evaluates whether the Up-Next Peek pill/toast should be surfaced for the current track.
 * @param {{
 *   enabled?: boolean;
 *   leadSeconds?: number;
 *   playerState?: any;
 *   currentTrack?: any;
 *   positionMs?: number;
 *   queue?: any;
 *   upNext?: any;
 *   dismissedKey?: string;
 * }} [opts]
 */
export function evaluateUpNextPeek(opts = {}) {
  const {
    enabled = true,
    leadSeconds = 15,
    playerState = null,
    currentTrack = null,
    positionMs = 0,
    queue = null,
    upNext = null,
    dismissedKey = "",
  } = opts;
  if (!enabled) return { show: false, reason: "disabled" };
  if (!playerState?.isPlaying || playerState?.isPaused) {
    return { show: false, reason: "not-playing" };
  }
  const currentUri = playerState?.trackUri || currentTrack?.uri || "";
  if (!currentUri || !/^spotify:track:/.test(currentUri)) {
    return { show: false, reason: "no-track" };
  }

  const durationMs =
    finite(currentTrack?.durationMs) ??
    finite(currentTrack?.duration_ms) ??
    finite(upNext?.current?.metadata?.duration_ms) ??
    null;
  const pos = finite(positionMs);
  if (durationMs == null || durationMs < 15000 || pos == null || pos < 0) {
    return { show: false, reason: "no-duration" };
  }

  const leadMs = clampLeadSeconds(leadSeconds) * 1000;
  const remainingMs = durationMs - pos;
  if (remainingMs <= 1000 || remainingMs > leadMs) {
    return { show: false, reason: "outside-window", remainingMs };
  }

  const manualNext = Array.isArray(queue?.next) ? queue.next : [];
  const contextNext = Array.isArray(upNext?.next)
    ? upNext.next
    : Array.isArray(upNext?.tracks)
      ? upNext.tracks
      : [];

  let isQueued = false;
  let nextEntry = null;
  if (manualNext.length > 0 && manualNext[0]?.uri) {
    nextEntry = manualNext[0];
    isQueued = true;
  } else if (contextNext.length > 0 && contextNext[0]?.uri) {
    nextEntry = contextNext[0];
    isQueued = false;
  }

  if (!nextEntry?.uri) {
    return { show: false, reason: "empty-upcoming" };
  }

  const nextIdentity = nextEntry.uid || nextEntry.uri;
  const triggerKey = `${currentUri}->${nextIdentity}`;
  if (dismissedKey && dismissedKey === triggerKey) {
    return { show: false, reason: "dismissed", triggerKey };
  }

  const rawTitle = extractEntryTitle(nextEntry);
  const rawArtist = extractEntryArtist(nextEntry);
  const badge = isQueued ? "Queued" : "Up Next";

  return {
    show: true,
    triggerKey,
    badge,
    isQueued,
    remainingMs,
    remainingSec: Math.max(1, Math.ceil(remainingMs / 1000)),
    nextUri: nextEntry.uri,
    title: rawTitle || "Next Track",
    artist: rawArtist,
    needsMetadataLookup: !rawTitle || !clean(rawTitle),
  };
}
