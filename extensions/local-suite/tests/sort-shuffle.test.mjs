import test from "node:test";
import assert from "node:assert/strict";
import { clean, smartShuffle } from "../shared/model.mjs";

function random(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// The existing artist-aware selection rule, kept here as a small compatibility
// oracle. Large inputs must not pay for its repeated scans and array shifting.
function reference(tracks, rng) {
  const pool = tracks.map(track => ({ track, random: rng() }))
    .sort((a, b) => a.random - b.random).map(row => row.track);
  const result = [];
  let previous = "";
  while (pool.length) {
    let index = pool.findIndex(track => clean(track.artists?.[0]?.name || track.artist) !== previous);
    if (index < 0) index = 0;
    const [track] = pool.splice(index, 1);
    result.push(track);
    previous = clean(track.artists?.[0]?.name || track.artist);
  }
  return result;
}

test("artist-aware shuffle retains the existing seeded selection rule, normalization and occurrences", () => {
  const names = ["Beyoncé", "Beyonce", "Other", "", "Same artist"];
  for (let seed = 1; seed <= 30; seed++) {
    const tracks = Array.from({ length: 80 }, (_, occurrence) => Object.freeze({
      uri: `spotify:track:${String(occurrence % 7).padStart(22, "0")}`,
      artist: names[(occurrence * seed) % names.length],
      ...(occurrence % 2 ? { artists: [{ name: names[occurrence % names.length] }] } : {}),
      occurrence,
    }));
    const before = [...tracks];
    assert.deepEqual(smartShuffle(Object.freeze(tracks), random(seed)), reference(tracks, random(seed)));
    assert.deepEqual(tracks, before);
  }
  assert.deepEqual(smartShuffle([]), []);
});

test("a repeated-artist collection reads artist identity once per occurrence instead of rescanning it", () => {
  const count = 2000;
  let reads = 0;
  const tracks = Array.from({ length: count }, (_, occurrence) => ({
    occurrence,
    get artist() {
      if (++reads > count * 3) throw new Error("Artist metadata was repeatedly rescanned");
      return "Same artist";
    },
  }));
  const result = smartShuffle(tracks, random(7));
  assert.equal(result.length, count);
  assert.equal(new Set(result).size, count);
  assert.ok(reads <= count * 3);
});

test("100,000 occurrences with a dominant artist are preserved without mutating the input", () => {
  const tracks = Array.from({ length: 100000 }, (_, occurrence) => Object.freeze({
    occurrence, artist: occurrence % 1000 ? "Dominant artist" : `Guest ${occurrence}`,
  }));
  const result = smartShuffle(Object.freeze(tracks), random(42));
  assert.equal(result.length, tracks.length);
  assert.equal(new Set(result).size, tracks.length);
  assert.equal(tracks[0].occurrence, 0);
});
