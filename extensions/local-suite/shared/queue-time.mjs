import { finite, formatClockMs, formatDuration } from "./model.mjs";

export function entryDurationMs(entry, extraDurations = null) {
  const candidates = [
    entry?.durationMs,
    entry?.duration_ms,
    entry?.metadata?.duration_ms,
    entry?.metadata?.durationMs,
    entry?.metadata?.duration,
    extraDurations?.get?.(entry?.uri),
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * @param {{ upNext?: any, playerState?: any, currentTrack?: any, extraDurations?: any, nowMs?: number }} params
 */
export function computeQueueSummary({
  upNext = null,
  playerState = null,
  currentTrack = null,
  extraDurations = null,
  nowMs = Date.now(),
}) {
  const pos = Math.max(0, Number(playerState?.positionMs) || 0);
  const currentDuration = finite(currentTrack?.durationMs) ?? entryDurationMs(upNext?.current, extraDurations) ?? 0;
  const currentRemaining = currentDuration > 0 ? Math.max(0, currentDuration - pos) : 0;
  const next = Array.isArray(upNext?.next) ? upNext.next : [];
  let upcomingMs = 0;
  let knownCount = currentDuration > 0 ? 1 : 0;
  let missingCount = 0;
  for (const item of next) {
    const d = entryDurationMs(item, extraDurations);
    if (d != null) {
      upcomingMs += d;
      knownCount++;
    } else {
      missingCount++;
    }
  }
  const hasCurrent = Boolean(playerState?.trackUri || currentTrack?.uri || upNext?.current?.uri);
  const totalCount = next.length + (hasCurrent ? 1 : 0);
  const remainingMs = currentRemaining + upcomingMs;
  const endsAtMs = nowMs + remainingMs;
  return {
    hasCurrent,
    currentRemainingMs: currentRemaining,
    upcomingCount: next.length,
    totalCount,
    knownCount,
    missingDurationCount: missingCount,
    remainingMs,
    endsAtMs,
    formattedRemaining: remainingMs > 0 ? formatDuration(remainingMs) : "0s",
    formattedEndsAt: totalCount > 0 ? formatClockMs(endsAtMs) : "",
  };
}

export async function resolveMissingQueueDurations(entries, dataClient, limit = 60, job = null) {
  const map = new Map();
  const missing = [];
  const seen = new Set();
  for (const item of entries || []) {
    const uri = item?.uri;
    if (!uri || !/^spotify:track:/.test(uri)) continue;
    if (entryDurationMs(item) != null || seen.has(uri)) continue;
    seen.add(uri);
    missing.push(uri);
    if (missing.length >= limit) break;
  }
  for (const uri of missing) {
    if (job?.cancelled) break;
    try {
      const track = await dataClient.track(uri, job);
      if (track?.durationMs > 0) map.set(uri, track.durationMs);
    } catch {
      // Best-effort hydration: unavailable items are counted as missingDurationCount.
    }
  }
  return map;
}

export function evaluateAbLoop(loop, currentUri, positionMs, isPlaying) {
  if (!loop?.enabled || !isPlaying || !currentUri || currentUri !== loop.trackUri) {
    return { action: "none" };
  }
  const a = Number(loop.loopA);
  const b = Number(loop.loopB);
  const pos = Number(positionMs);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(pos) || b <= a + 500) {
    return { action: "none" };
  }
  if (pos >= b || pos + 1500 < a) {
    return { action: "seek", positionMs: Math.max(0, Math.floor(a)) };
  }
  return { action: "none" };
}

export function evaluateOutroSkip(state, currentUri, positionMs, isPlaying, nowMs = Date.now()) {
  if (!state?.enabled || !isPlaying || !currentUri) return { action: "none" };
  const outroMs = Number(state.outroMs);
  const pos = Number(positionMs);
  if (!Number.isFinite(outroMs) || outroMs <= 0 || !Number.isFinite(pos)) {
    return { action: "none" };
  }
  if (state.suppressUntilMs && nowMs < state.suppressUntilMs) {
    return { action: "none" };
  }
  if (state.lastTriggeredUri === currentUri && nowMs - (state.lastTriggeredAt || 0) < 8000) {
    return { action: "none" };
  }
  // Only trigger inside a sane window around outroMs so manually seeking past or backward stays safe.
  if (pos >= outroMs && pos <= outroMs + 6000) {
    return { action: "skip-next" };
  }
  return { action: "none" };
}
