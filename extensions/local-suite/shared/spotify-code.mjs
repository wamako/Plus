const CHARCOAL_HEX = "181818";

function sanitizeHexColor(raw, fallback = CHARCOAL_HEX) {
  const hex = String(raw || "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Enforce non-AMOLED floor so pure #000000 is never emitted.
  if (r < 16 && g < 16 && b < 16) return CHARCOAL_HEX;
  return hex;
}

export function spotifyCodeUrl(
  uri,
  { bgHex = CHARCOAL_HEX, barColor = "white", size = 640, format = "png" } = {},
) {
  const cleanUri = String(uri || "").trim();
  if (!/^spotify:(track|album|artist|playlist|show|episode):[A-Za-z0-9]+$/.test(cleanUri)) {
    return "";
  }
  const safeBg = sanitizeHexColor(bgHex, CHARCOAL_HEX);
  const safeBar = barColor === "black" ? "black" : "white";
  const safeFmt = format === "svg" ? "svg" : "png";
  const safeSize = Math.max(256, Math.min(1024, Math.round(Number(size) || 640)));
  return `https://scannables.scdn.co/uri/plain/${safeFmt}/${safeBg}/${safeBar}/${safeSize}/${encodeURIComponent(cleanUri)}`;
}

/**
 * Generates deterministic 23-bar visual preview heights (used alongside live scannable artwork
 * or as an immediate offline placeholder frame before network load).
 */
export function spotifyCodePreviewBars(uri) {
  const str = String(uri || "spotify:track:preview");
  let seed = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    seed ^= str.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const bars = [];
  for (let i = 0; i < 23; i++) {
    if (i === 0 || i === 11 || i === 22) {
      bars.push(1.0);
      continue;
    }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const level = (seed % 7) + 1;
    bars.push(Number((0.22 + (level / 7) * 0.72).toFixed(2)));
  }
  return bars;
}
