import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrack,
  normalizeTitleArtistKey,
  formatDuration,
  totalDurationMs,
  filterTracks,
  findDuplicates,
  sortTracks,
  isForgottenFavorite,
  weightedForgottenShuffle,
} from "../shared/model.mjs";
import {
  RatingsStore,
  StatsBridge,
  BookmarksStore,
} from "../shared/suite-store.mjs";
import {
  entryDurationMs,
  computeQueueSummary,
  resolveMissingQueueDurations,
  evaluateAbLoop,
  evaluateOutroSkip,
} from "../shared/queue-time.mjs";
import {
  matchTrackInCollection,
  findPlaylistsContainingTrack,
} from "../shared/playlist-index.mjs";

function memStorage() {
  const map = new Map();
  return {
    get: (k) => (map.has(k) ? structuredClone(map.get(k)) : null),
    set: (k, v) => map.set(k, structuredClone(v)),
    remove: (k) => map.delete(k),
  };
}

test("normalizeTitleArtistKey catches remasters, deluxe tags, and featuring suffixes", () => {
  const a = { title: "Everlong - 2011 Remaster", artist: "Foo Fighters" };
  const b = { title: "Everlong (Deluxe Edition) (feat. Someone)", artist: "Foo Fighters" };
  assert.equal(normalizeTitleArtistKey(a), "everlong::foo fighters");
  assert.equal(normalizeTitleArtistKey(a), normalizeTitleArtistKey(b));
});

test("findDuplicates and title-artist dedupe preserve first occurrence and report duplicates", () => {
  const tracks = [
    normalizeTrack({ uri: "spotify:track:1", name: "Song A", artists: [{ name: "Artist X" }], duration_ms: 120000 }),
    normalizeTrack({ uri: "spotify:track:2", name: "Song A (Remastered 2020)", artists: [{ name: "Artist X" }], duration_ms: 121000 }),
    normalizeTrack({ uri: "spotify:track:3", name: "Song B", artists: [{ name: "Artist Y" }], duration_ms: 180000 }),
  ];
  const dupes = findDuplicates(tracks, "title-artist");
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].duplicate.uri, "spotify:track:2");
  assert.equal(dupes[0].kept.uri, "spotify:track:1");

  const filtered = filterTracks(tracks, { dedupe: "title-artist" });
  assert.deepEqual(filtered.map((t) => t.uri), ["spotify:track:1", "spotify:track:3"]);
});

test("RatingsStore, StatsBridge, and sorting/filtering by rating, playCount, and forgotten status", () => {
  const storage = memStorage();
  const ratings = new RatingsStore(storage);
  const bridge = new StatsBridge(storage);
  const now = 1_750_000_000_000;
  const oldTs = now - 45 * 86400000;
  const recentTs = now - 2 * 86400000;

  ratings.set("spotify:track:1", 9, { title: "Old Gem", artist: "Artist 1" });
  ratings.set("spotify:track:2", 5, { title: "Mid Track", artist: "Artist 2" });
  assert.throws(() => ratings.set("spotify:track:1", 11), /1 to 10/);

  bridge.syncFromEvents(
    [
      { uri: "spotify:track:1", title: "Old Gem", artist: "Artist 1", play: true, listenedMs: 90000, startedAt: oldTs },
      { uri: "spotify:track:1", title: "Old Gem", artist: "Artist 1", play: true, listenedMs: 90000, startedAt: oldTs + 1000 },
      { uri: "spotify:track:2", title: "Mid Track", artist: "Artist 2", play: true, listenedMs: 60000, startedAt: recentTs },
    ],
    now,
  );

  const raw = [
    normalizeTrack({ uri: "spotify:track:1", name: "Old Gem", artists: [{ name: "Artist 1" }], duration_ms: 180000 }),
    normalizeTrack({ uri: "spotify:track:2", name: "Mid Track", artists: [{ name: "Artist 2" }], duration_ms: 150000 }),
    normalizeTrack({ uri: "spotify:track:3", name: "Unrated", artists: [{ name: "Artist 3" }], duration_ms: 200000 }),
  ];
  const hydrated = bridge.hydrateTracks(raw, ratings);
  assert.equal(hydrated[0].rating, 9);
  assert.equal(hydrated[0].playCount, 2);
  assert.equal(hydrated[2].rating, null);

  assert.equal(isForgottenFavorite(hydrated[0], now - 30 * 86400000), true);
  assert.equal(isForgottenFavorite(hydrated[1], now - 30 * 86400000), false);

  const unratedOnly = filterTracks(hydrated, { minRating: -1 });
  assert.deepEqual(unratedOnly.map((t) => t.uri), ["spotify:track:3"]);

  const rated7Plus = filterTracks(hydrated, { minRating: 7 });
  assert.deepEqual(rated7Plus.map((t) => t.uri), ["spotify:track:1"]);

  const forgottenOnly = filterTracks(hydrated, { forgottenDays: 30, nowMs: now });
  assert.deepEqual(forgottenOnly.map((t) => t.uri), ["spotify:track:1"]);

  const byRatingDesc = sortTracks(hydrated, "rating", true);
  assert.deepEqual(byRatingDesc.map((t) => t.uri), ["spotify:track:1", "spotify:track:2", "spotify:track:3"]);

  const ffList = bridge.forgottenFavorites(30, now, ratings);
  assert.equal(ffList.length, 1);
  assert.equal(ffList[0].uri, "spotify:track:1");
  assert.equal(ffList[0].daysAgo, 44);
});

test("weightedForgottenShuffle preserves all items without duplication", () => {
  const tracks = Array.from({ length: 10 }, (_, i) => ({
    uri: `spotify:track:${i}`,
    title: `Track ${i}`,
    artist: "A",
    rating: i === 0 ? 10 : null,
    playCount: i === 0 ? 5 : 1,
    lastPlayed: i === 0 ? 1000 : Date.now(),
  }));
  let seed = 0.1;
  const out = weightedForgottenShuffle(tracks, () => {
    seed = (seed * 7 + 0.13) % 0.99;
    return Math.max(0.01, seed);
  });
  assert.equal(out.length, 10);
  assert.equal(new Set(out.map((t) => t.uri)).size, 10);
});

test("BookmarksStore manages bookmarks and outro skip timestamps safely", () => {
  const storage = memStorage();
  const store = new BookmarksStore(storage);
  const b1 = store.add({ uri: "spotify:track:1", title: "Solo", artist: "Band", positionMs: 64000, note: "guitar solo" });
  store.add({ uri: "spotify:track:2", title: "Other", artist: "Band", positionMs: 12000 });
  assert.equal(store.forTrack("spotify:track:1").length, 1);
  assert.equal(store.all().length, 2);
  store.remove(b1.id);
  assert.equal(store.forTrack("spotify:track:1").length, 0);

  assert.throws(() => store.setOutro("spotify:track:1", 2000), /at least 5 seconds/);
  store.setOutro("spotify:track:1", 185000, { title: "Solo" });
  assert.equal(store.getOutro("spotify:track:1"), 185000);
  store.clearOutro("spotify:track:1");
  assert.equal(store.getOutro("spotify:track:1"), null);
});

test("queue-time calculations, duration formatting, A-B loop, and outro auto-skip", async () => {
  assert.equal(formatDuration(65000), "1m 05s");
  assert.equal(formatDuration(3723000), "1h 02m");
  assert.deepEqual(totalDurationMs([{ durationMs: 60000 }, { durationMs: 0 }, { durationMs: 90000 }]), {
    totalMs: 150000,
    known: 2,
    total: 3,
  });

  const extra = new Map([["spotify:track:2", 120000]]);
  assert.equal(entryDurationMs({ uri: "spotify:track:1", metadata: { duration_ms: "180000" } }), 180000);
  const summary = computeQueueSummary({
    upNext: {
      current: { uri: "spotify:track:1", durationMs: 200000 },
      next: [
        { uri: "spotify:track:2" },
        { uri: "spotify:track:3" },
      ],
    },
    playerState: { trackUri: "spotify:track:1", positionMs: 50000 },
    currentTrack: { uri: "spotify:track:1", durationMs: 200000 },
    extraDurations: extra,
    nowMs: 1_750_000_000_000,
  });
  assert.equal(summary.remainingMs, 270000);
  assert.equal(summary.missingDurationCount, 1);
  assert.equal(summary.formattedRemaining, "4m 30s");

  const resolved = await resolveMissingQueueDurations(
    [{ uri: "spotify:track:9" }],
    { track: async (uri) => ({ uri, durationMs: 210000 }) },
  );
  assert.equal(resolved.get("spotify:track:9"), 210000);

  assert.deepEqual(
    evaluateAbLoop({ enabled: true, trackUri: "spotify:track:1", loopA: 10000, loopB: 25000 }, "spotify:track:1", 25200, true),
    { action: "seek", positionMs: 10000 },
  );
  assert.deepEqual(
    evaluateAbLoop({ enabled: true, trackUri: "spotify:track:1", loopA: 10000, loopB: 25000 }, "spotify:track:2", 25200, true),
    { action: "none" },
  );

  assert.deepEqual(
    evaluateOutroSkip({ enabled: true, outroMs: 180000 }, "spotify:track:1", 180500, true, 50000),
    { action: "skip-next" },
  );
  assert.deepEqual(
    evaluateOutroSkip({ enabled: true, outroMs: 180000, suppressUntilMs: 60000 }, "spotify:track:1", 180500, true, 50000),
    { action: "none" },
  );
});

test("playlist reverse-lookup matches exact URI, ISRC, and normalized title+artist and caches", async () => {
  const storage = memStorage();
  let listCalls = 0;
  let collectionCalls = 0;
  const mockClient = {
    api: {
      Platform: { Storage: storage },
      Library: {
        list: async () => {
          listCalls++;
          return {
            items: [
              { uri: "spotify:playlist:A", name: "Roadtrip" },
              { uri: "spotify:playlist:B", name: "Chill" },
            ],
            hasNext: false,
          };
        },
      },
    },
    collection: async (uri, _job, progress) => {
      collectionCalls++;
      // Verify progress callback is always callable (real data.mjs calls progress(...)).
      progress("ok");
      if (uri === "spotify:playlist:A") {
        return {
          name: "Roadtrip",
          tracks: [{ uri: "spotify:track:other", title: "Dreams (2004 Remaster)", artist: "Fleetwood Mac", isrc: "" }],
        };
      }
      return {
        name: "Chill",
        tracks: [{ uri: "spotify:track:target", title: "Different", artist: "X", isrc: "US123" }],
      };
    },
  };

  assert.deepEqual(
    matchTrackInCollection({ uri: "spotify:track:1", title: "Dreams", artist: "Fleetwood Mac" }, [
      { uri: "spotify:track:2", title: "Dreams - Remastered", artist: "Fleetwood Mac" },
    ]),
    { matchType: "title-artist", matchedTitle: "Dreams - Remastered" },
  );

  const first = await findPlaylistsContainingTrack(mockClient, {
    uri: "spotify:track:target",
    title: "Dreams",
    artist: "Fleetwood Mac",
    isrc: "",
  });
  assert.equal(first.fromCache, false);
  assert.equal(first.matches.length, 2);
  assert.equal(listCalls, 1);
  assert.equal(collectionCalls, 2);

  const second = await findPlaylistsContainingTrack(mockClient, {
    uri: "spotify:track:target",
    title: "Dreams",
    artist: "Fleetwood Mac",
  });
  assert.equal(second.fromCache, true);
  assert.equal(listCalls, 1);

  const refreshed = await findPlaylistsContainingTrack(mockClient, {
    uri: "spotify:track:target",
    title: "Dreams",
    artist: "Fleetwood Mac",
  }, { forceRefresh: true });
  assert.equal(refreshed.fromCache, false);
  assert.equal(listCalls, 2);
});

test("normalizeTitleArtistKey strips Unicode/ASCII punctuation cleanly without \\p{} escapes", () => {
  const accented = { title: "Café — (2019 Remaster)!", artist: "Beyoncé, Jay-Z" };
  assert.equal(normalizeTitleArtistKey(accented), "cafe::beyonce");
  const cjk = { title: "夜に駆ける「Single Version」", artist: "YOASOBI" };
  assert.equal(normalizeTitleArtistKey(cjk), "夜に駆ける single version::yoasobi");
});
