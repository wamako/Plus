import test from "node:test";
import assert from "node:assert/strict";
import {
  clampLeadSeconds,
  UpNextPeekStore,
  evaluateUpNextPeek,
} from "../shared/up-next-peek.mjs";
import {
  SmartSkipStore,
  evaluateTrackAutoSkip,
  buildStudioSearchQuery,
  rankStudioCandidates,
} from "../shared/smart-skip.mjs";
import {
  spotifyTrackUrl,
  songlinkApiUrl,
  extractPlatformLinks,
  fetchUniversalLinks,
  youtubeVideoSearchUrl,
} from "../shared/links-media.mjs";
import {
  formatReleaseBadge,
  buildBadgeSummary,
  NowPlayingBadgeStore,
} from "../shared/nowplaying-badges.mjs";
import { spotifyCodeUrl, spotifyCodePreviewBars } from "../shared/spotify-code.mjs";

function memStorage() {
  const map = new Map();
  return {
    get: (k) => (map.has(k) ? structuredClone(map.get(k)) : null),
    set: (k, v) => map.set(k, structuredClone(v)),
    remove: (k) => map.delete(k),
  };
}

test("3.5 Up-Next Peek distinguishes manual Queue vs Up Next and respects dismiss/lead window", () => {
  const storage = memStorage();
  const store = new UpNextPeekStore(storage);
  assert.equal(clampLeadSeconds(2), 5);
  assert.equal(clampLeadSeconds(60), 30);

  const saved = store.saveSettings({ enabled: true, leadSeconds: 18 });
  assert.equal(saved.leadSeconds, 18);

  const currentTrack = { uri: "spotify:track:1111111111111111111111", durationMs: 200000 };
  const playerState = { trackUri: currentTrack.uri, isPlaying: true, isPaused: false };

  // Outside lead window (30s left > 18s)
  const early = evaluateUpNextPeek({
    enabled: true,
    leadSeconds: 18,
    playerState,
    currentTrack,
    positionMs: 170000,
    upNext: { next: [{ uri: "spotify:track:2222222222222222222222", uid: "u2", metadata: { title: "Next Song", artist_name: "Artist B" } }] },
  });
  assert.equal(early.show, false);

  // Inside window with manual queue overriding UpNext
  const manualPeek = evaluateUpNextPeek({
    enabled: true,
    leadSeconds: 18,
    playerState,
    currentTrack,
    positionMs: 188000,
    queue: { next: [{ uri: "spotify:track:3333333333333333333333", uid: "q1", metadata: { title: "Queued Hit", artist_name: "Artist Q" } }] },
    upNext: { next: [{ uri: "spotify:track:2222222222222222222222", uid: "u2", metadata: { title: "Context Track", artist_name: "Artist B" } }] },
  });
  assert.equal(manualPeek.show, true);
  assert.equal(manualPeek.badge, "Queued");
  assert.equal(manualPeek.isQueued, true);
  assert.equal(manualPeek.title, "Queued Hit");
  assert.equal(manualPeek.remainingSec, 12);

  // Dismissing the exact trigger key hides it
  const dismissed = evaluateUpNextPeek({
    enabled: true,
    leadSeconds: 18,
    playerState,
    currentTrack,
    positionMs: 190000,
    queue: { next: [{ uri: "spotify:track:3333333333333333333333", uid: "q1", metadata: { title: "Queued Hit" } }] },
    dismissedKey: manualPeek.triggerKey,
  });
  assert.equal(dismissed.show, false);

  // Paused playback suppresses peek
  const paused = evaluateUpNextPeek({
    enabled: true,
    leadSeconds: 18,
    playerState: { ...playerState, isPlaying: false, isPaused: true },
    currentTrack,
    positionMs: 190000,
    upNext: { next: [{ uri: "spotify:track:2222222222222222222222", uid: "u2" }] },
  });
  assert.equal(paused.show, false);
});

test("3.6 Smart Auto-Skip filters variants cleanly without false-positive Live matches, and supports Trashbin & auto-trash", () => {
  const storage = memStorage();
  const store = new SmartSkipStore(storage);
  store.togglePreset("live", true);
  store.togglePreset("sped_up", true);

  let state = store.readState();
  // Normal songs containing "live" must NOT false-trigger!
  assert.equal(evaluateTrackAutoSkip(state, { uri: "spotify:track:a", title: "Alive", artist: "Pearl Jam" }).skip, false);
  assert.equal(evaluateTrackAutoSkip(state, { uri: "spotify:track:b", title: "Live Forever", artist: "Oasis" }).skip, false);

  // Concert/variant versions MUST trigger
  const liveAt = evaluateTrackAutoSkip(state, { uri: "spotify:track:c", title: "Everlong - Live at Wembley", artist: "Foo Fighters" });
  assert.equal(liveAt.skip, true);
  const sped = evaluateTrackAutoSkip(state, { uri: "spotify:track:d", title: "Track [Sped Up]", artist: "Someone" });
  assert.equal(sped.skip, true);

  // Manual skip auto-trash at threshold N=2
  store.setAutoTrash(true, 2);
  const disliked = { uri: "spotify:track:4444444444444444444444", title: "Skip Me", artist: "Bad Artist" };
  assert.equal(store.recordManualSkip(disliked).trashed, false);
  const second = store.recordManualSkip(disliked);
  assert.equal(second.trashed, true);
  assert.equal(evaluateTrackAutoSkip(store.readState(), disliked).skip, true);

  // Restore from trashbin
  store.restoreTrack(disliked.uri);
  assert.equal(evaluateTrackAutoSkip(store.readState(), disliked).skip, false);
});

test("3.6 Find Original Studio Version strips variant tags and ranks original over live/remix", () => {
  const liveTrack = {
    uri: "spotify:track:live1",
    title: "Mr. Brightside (Live at Royal Albert Hall) - 2012 Remaster",
    artist: "The Killers",
  };
  assert.equal(buildStudioSearchQuery(liveTrack), "Mr. Brightside The Killers");

  const candidates = [
    { uri: "spotify:track:live1", title: liveTrack.title, artist: "The Killers" },
    { uri: "spotify:track:remix", title: "Mr. Brightside (Jacques Lu Cont Remix)", artist: "The Killers" },
    { uri: "spotify:track:orig", title: "Mr. Brightside", artist: "The Killers" },
  ];
  const ranked = rankStudioCandidates(candidates, liveTrack);
  assert.equal(ranked[0].uri, "spotify:track:orig");
});

test("3.7b Odesli/Song.link & YouTube Music Video build clean URLs and cache responses", async () => {
  const storage = memStorage();
  const trackUri = "spotify:track:4cOdK2wGLETKBW3PvgPWqT";
  assert.equal(
    spotifyTrackUrl("https://open.spotify.com/intl-ja/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123"),
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  );
  assert.ok(songlinkApiUrl(trackUri).includes("https://api.song.link/v1-alpha.1/links"));

  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        pageUrl: "https://song.link/s/test",
        linksByPlatform: {
          appleMusic: { url: "https://geo.music.apple.com/us/album/1" },
          youtubeMusic: { url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" },
          malicious: { url: "javascript:alert(1)" },
        },
      }),
    };
  };

  const first = await fetchUniversalLinks(trackUri, storage, fakeFetch);
  assert.equal(first.fromCache, false);
  assert.equal(first.pageUrl, "https://song.link/s/test");
  assert.equal(first.platforms.some((p) => p.id === "appleMusic"), true);
  assert.equal(calls, 1);

  const second = await fetchUniversalLinks(trackUri, storage, fakeFetch);
  assert.equal(second.fromCache, true);
  assert.equal(calls, 1);

  const ytUrl = youtubeVideoSearchUrl({ title: "Song", artist: "Artist" });
  assert.ok(ytUrl.startsWith("https://www.youtube.com/results?search_query="));
  assert.equal(extractPlatformLinks(null).platforms.length, 0);
});

test("3.8 NowPlaying micro-badges and non-AMOLED Scannable Spotify Code format accurately", () => {
  const now = new Date(Date.UTC(2026, 10, 13));
  assert.equal(formatReleaseBadge({ year: 2016, month: 5, day: 1 }, now).shortLabel, "2016 · 10y");
  assert.equal(formatReleaseBadge("2026-08-01", now).shortLabel, "2026 · 3mo");
  assert.equal(formatReleaseBadge("2026-11-13", now).shortLabel, "2026 · Today");
  assert.equal(formatReleaseBadge(new Date(Date.UTC(2025, 6, 25)), now).shortLabel, "2025 · 1y");
  assert.equal(formatReleaseBadge("Fri Jul 25 2025 00:00:00 GMT+0000", now).shortLabel, "2025 · 1y");

  const summary = buildBadgeSummary({
    releaseDate: "2018-10-05",
    rating: 9,
    playCount: 14,
    now,
  });
  assert.equal(summary.text, "2018 · 8y · 9★ · 14 plays");

  const badgeStore = new NowPlayingBadgeStore(memStorage());
  assert.equal(badgeStore.getSettings().enabled, true);

  // Passing #000000 must always lift to charcoal 181818 (zero AMOLED pure black)
  const codeUrl = spotifyCodeUrl("spotify:track:4cOdK2wGLETKBW3PvgPWqT", { bgHex: "000000" });
  assert.ok(codeUrl.includes("/plain/png/181818/white/"));
  assert.equal(spotifyCodePreviewBars("spotify:track:4cOdK2wGLETKBW3PvgPWqT").length, 23);
});
