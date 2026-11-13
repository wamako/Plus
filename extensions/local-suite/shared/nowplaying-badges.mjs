import { finite } from "./model.mjs";

const NP_BADGES_PREFS_KEY = "@suite/np-badges-v1";

export const DEFAULT_NP_BADGE_SETTINGS = {
  enabled: true,
  showReleaseAge: true,
  showRatingAndPlays: true,
  showQuickBookmark: true,
  showSpotifyCodeButton: true,
};

export class NowPlayingBadgeStore {
  constructor(storage) {
    this.storage = storage;
  }

  getSettings() {
    try {
      const saved = this.storage?.get?.(NP_BADGES_PREFS_KEY);
      if (!saved || typeof saved !== "object") {
        return { ...DEFAULT_NP_BADGE_SETTINGS };
      }
      return {
        enabled: saved.enabled !== false,
        showReleaseAge: saved.showReleaseAge !== false,
        showRatingAndPlays: saved.showRatingAndPlays !== false,
        showQuickBookmark: saved.showQuickBookmark !== false,
        showSpotifyCodeButton: saved.showSpotifyCodeButton !== false,
      };
    } catch {
      return { ...DEFAULT_NP_BADGE_SETTINGS };
    }
  }

  saveSettings(patch = {}) {
    const next = {
      ...this.getSettings(),
      ...patch,
    };
    this.storage?.set?.(NP_BADGES_PREFS_KEY, next);
    return next;
  }
}

export function parseReleaseDate(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const year = input.getUTCFullYear();
    if (year < 1900 || year > 2100) return null;
    return {
      year,
      month: input.getUTCMonth() + 1,
      day: input.getUTCDate(),
    };
  }
  if (typeof input === "object") {
    const year = finite(input.year);
    if (!year || year < 1900 || year > 2100) return null;
    const month = finite(input.month);
    const day = finite(input.day);
    return {
      year,
      month: month && month >= 1 && month <= 12 ? month : null,
      day: day && day >= 1 && day <= 31 ? day : null,
    };
  }
  const str = String(input).trim();
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(str);
  if (match) {
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) : null;
    const day = match[3] ? Number(match[3]) : null;
    return {
      year,
      month: month && month >= 1 && month <= 12 ? month : null,
      day: day && day >= 1 && day <= 31 ? day : null,
    };
  }
  const parsedMs = Date.parse(str);
  if (Number.isFinite(parsedMs)) {
    return parseReleaseDate(new Date(parsedMs));
  }
  return null;
}

export function formatReleaseBadge(releaseDate, now = new Date()) {
  const parsed = parseReleaseDate(releaseDate);
  if (!parsed) return { iso: "", shortLabel: "" };

  const pad2 = (n) => String(n).padStart(2, "0");
  const iso = parsed.month
    ? parsed.day
      ? `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}`
      : `${parsed.year}-${pad2(parsed.month)}`
    : String(parsed.year);

  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;
  const curDay = now.getUTCDate();

  let years = curYear - parsed.year;
  if (
    parsed.month != null &&
    (curMonth < parsed.month ||
      (curMonth === parsed.month && parsed.day != null && curDay < parsed.day))
  ) {
    years -= 1;
  }

  if (years >= 1) {
    return { iso, shortLabel: `${parsed.year} \u00B7 ${years}y` };
  }

  if (parsed.month != null) {
    const months = (curYear - parsed.year) * 12 + (curMonth - parsed.month) -
      (parsed.day != null && curDay < parsed.day ? 1 : 0);
    if (months >= 1) {
      return { iso, shortLabel: `${parsed.year} \u00B7 ${months}mo` };
    }
    if (months === 0 && parsed.day != null) {
      const days = Math.max(0, curDay - parsed.day);
      return {
        iso,
        shortLabel: days === 0 ? `${parsed.year} \u00B7 Today` : `${parsed.year} \u00B7 ${days}d`,
      };
    }
  }

  return { iso, shortLabel: String(parsed.year) };
}

/**
 * @param {{
 *   releaseDate?: any;
 *   rating?: number | null;
 *   playCount?: number | null;
 *   now?: Date;
 * }} [opts]
 */
export function buildBadgeSummary(opts = {}) {
  const {
    releaseDate,
    rating = null,
    playCount = null,
    now = new Date(),
  } = opts;
  const rel = formatReleaseBadge(releaseDate, now);
  const parts = [];
  if (rel.shortLabel) parts.push(rel.shortLabel);
  if (Number.isInteger(rating) && rating >= 1 && rating <= 10) {
    parts.push(`${rating}\u2605`);
  } else {
    parts.push("Rate \u2605");
  }
  const plays = finite(playCount);
  if (plays != null && plays > 0) {
    parts.push(`${plays} ${plays === 1 ? "play" : "plays"}`);
  }
  return {
    releaseIso: rel.iso,
    releaseLabel: rel.shortLabel,
    parts,
    text: parts.join(" \u00B7 "),
  };
}
