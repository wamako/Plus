import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrack,
  spotifyUri,
  sortTracks,
  filterTracks,
  smartShuffle,
  genreTags,
  genreCounts,
  csv,
} from "../shared/model.mjs";
import { ListeningTracker, aggregate } from "../shared/stats.mjs";
import { makeHttp, RequestError, mapLimit, Cache } from "../shared/net.mjs";
import { DataClient } from "../shared/data.mjs";
const id = (n) => String(n).padStart(22, "0"),
  uri = (n) => `spotify:track:${id(n)}`,
  playlist = `spotify:playlist:${id(99)}`;
const track = (n, extra = {}) =>
  normalizeTrack({
    uri: uri(n),
    name: `Song ${n}`,
    artists: [{ name: `Artist ${n}`, uri: `spotify:artist:${id(n)}` }],
    album: { name: "Album" },
    ...extra,
  });
function fixture(request) {
  const values = new Map();
  const storage = {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, structuredClone(value)),
    remove: (key) => values.delete(key),
  };
  const api = {
    Platform: { Storage: storage, Session: { accessToken: "secret-token" } },
    Playlists: {
      get: async () => ({ name: "Native", items: [{ uri: uri(1) }], total: 1 }),
    },
    Internal: {
      getTrack: async (uri) => ({
        uri,
        title: "Native track",
        artist: "Native artist",
        explicit: false,
      }),
    },
  };
  return { values, api, client: new DataClient(api, request) };
}
const json = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => value,
});

test("Spotify links normalize and reject untrusted hosts, types and malformed IDs", () => {
  assert.equal(
    spotifyUri(`https://open.spotify.com/intl-en/track/${id(1)}?si=x`),
    uri(1),
  );
  for (const input of [
    "https://evil.example/track/x",
    "spotify:episode:" + id(1),
    "spotify:track:short",
    "https://open.spotify.com/track/" + id(1) + "/extra",
  ])
    assert.throws(() => spotifyUri(input));
  assert.throws(() => spotifyUri(uri(1), "playlist"));
});
test("new and old playlist row formats preserve dates, duplicate occurrences and unknown flags", () => {
  const source = {
    added_at: "2026-01-01T00:00:00Z",
    item: {
      uri: uri(1),
      name: "Title",
      artists: [{ id: id(2), name: "Artist" }],
      album: { name: "Album", release_date: "2020" },
    },
  };
  const a = normalizeTrack(source, 3),
    b = normalizeTrack({ ...source, track: source.item, item: undefined }, 3);
  assert.deepEqual(a, b);
  assert.equal(a.explicit, null);
  assert.equal(a.available, null);
  assert.equal(a.sourceIndex, 3);
  assert.equal(a.artists[0].uri, `spotify:artist:${id(2)}`);
});
test("sorts are stable, nonmutating and keep unknown numbers last in either direction", () => {
  const rows = [
    track(1, { popularity: 20 }),
    track(2),
    track(3, { popularity: 10 }),
    track(4, { popularity: 20 }),
  ];
  assert.deepEqual(
    sortTracks(rows, "popularity").map((t) => t.uri),
    [uri(3), uri(1), uri(4), uri(2)],
  );
  assert.deepEqual(
    sortTracks(rows, "popularity", true).map((t) => t.uri),
    [uri(1), uri(4), uri(3), uri(2)],
  );
  assert.equal(rows[0].uri, uri(1));
});
test("release precision is normalized chronologically", () => {
  const rows = ["2020-12-31", "2019", "2020-01", "2020"].map((date, i) =>
    track(i, { album: { release_date: date } }),
  );
  assert.deepEqual(
    sortTracks(rows, "release").map((t) => t.releaseDate),
    ["2019", "2020-01", "2020", "2020-12-31"],
  );
});
test("URI/ISRC deduplication and primary artist limits preserve first selected occurrence", () => {
  const a = track(1, { isrc: "AB123" }),
    b = track(2, { isrc: "AB123" }),
    c = track(3, {
      artists: [{ name: "Artist 1", uri: `spotify:artist:${id(1)}` }],
    });
  assert.equal(filterTracks([a, a, b, c], { dedupe: "uri" }).length, 3);
  assert.equal(filterTracks([a, a, b, c], { dedupe: "recording" }).length, 2);
  assert.deepEqual(
    filterTracks([a, b, c], { onePerArtist: true }).map((t) => t.uri),
    [uri(1), uri(2)],
  );
});
test("Any/All genres are exact normalized labels and unknown flags are not treated as clean", () => {
  const rows = [
    track(1, { genres: ["hiphop", "rnb"] }),
    track(2, { genres: ["rock"], explicit: false }),
    track(3),
  ];
  assert.deepEqual(
    filterTracks(rows, { genres: ["hip hop", "rock"] }).map((t) => t.uri),
    [uri(1), uri(2)],
  );
  assert.equal(
    filterTracks(rows, { genres: ["hip hop", "rock"], match: "all" }).length,
    0,
  );
  assert.deepEqual(
    filterTracks(rows, { explicit: "clean" }).map((t) => t.uri),
    [uri(2)],
  );
  assert.equal(filterTracks(rows, { availableOnly: true }).length, 0);
  assert.deepEqual(genreTags(["Seen Live", "RNB", "r&b", "123"]), ["r&b"]);
  assert.equal(genreCounts(rows)[0].count, 1);
});
test("artist-aware shuffle preserves every occurrence and avoids adjacent artist when possible", () => {
  const rows = [track(1), track(2), track(1), track(2)];
  const shuffled = smartShuffle(rows, () => 0.5);
  assert.equal(shuffled.length, 4);
  assert.deepEqual(
    shuffled.map((t) => t.uri).sort(),
    rows.map((t) => t.uri).sort(),
  );
  for (let i = 1; i < shuffled.length; i++)
    assert.notEqual(shuffled[i].artist, shuffled[i - 1].artist);
});
test("CSV handles quotes, line breaks and spreadsheet formulas", () => {
  const text = csv(
    [{ title: "=1+1", artist: 'A,"B"\nC' }],
    ["title", "artist"],
  );
  assert.match(text, /"'=1\+1"/);
  assert.match(text, /A,""B""\nC/);
});

function sample(positionMs, extra = {}) {
  return {
    track: track(1, { durationMs: 200000 }),
    positionMs,
    isPlaying: true,
    isPaused: false,
    isBuffering: false,
    ...extra,
  };
}
test("listening only qualifies after actual observed time; pauses and seeks are excluded", () => {
  const t = new ListeningTracker();
  t.sample(sample(0), 0);
  t.sample(sample(20000), 20000);
  assert.equal(t.data.events[0].play, false);
  t.markSeek();
  t.sample(sample(120000), 21000);
  t.sample(sample(130000), 31000);
  assert.equal(t.data.events[0].listenedMs, 30000);
  assert.equal(t.data.events[0].play, true);
  t.sample(sample(130000, { isPaused: true, isPlaying: false }), 41000);
  t.sample(sample(130000, { isPaused: true, isPlaying: false }), 51000);
  assert.equal(t.data.events[0].listenedMs, 30000);
  assert.equal(t.data.events.length, 1);
});
test("short tracks qualify at ninety percent; long gaps and buffering do not accrue", () => {
  const t = new ListeningTracker();
  t.sample(sample(0, { track: track(1, { durationMs: 10000 }) }), 0);
  t.sample(sample(9000, { track: track(1, { durationMs: 10000 }) }), 9000);
  assert.equal(t.data.events[0].play, true);
  const a = new ListeningTracker();
  a.sample(sample(0, { isBuffering: true }), 0);
  a.sample(sample(2000), 2000);
  a.sample(sample(90000), 90000);
  assert.equal(a.data.events[0].listenedMs, 0);
});
test("local stats retain bounded sessions and filter ranges without inventing plays", () => {
  const t = new ListeningTracker({
    events: Array.from({ length: 10000 }, (_, i) => ({
      uri: uri(i),
      startedAt: i,
      listenedMs: 0,
      play: false,
    })),
  });
  t.sample(sample(0), 10001);
  assert.equal(t.data.events.length, 10000);
  const result = aggregate(
    [
      {
        uri: uri(1),
        title: "One",
        artist: "A",
        album: "B",
        startedAt: 100,
        listenedMs: 30000,
        play: true,
      },
      {
        uri: uri(2),
        title: "Two",
        artist: "A",
        startedAt: 200,
        listenedMs: 1000,
        play: false,
      },
    ],
    { after: 150 },
  );
  assert.equal(result.plays, 0);
  assert.equal(result.listenedMs, 1000);
});

test("bounded map stops scheduling after cancellation", async () => {
  let active = 0,
    peak = 0;
  const job = { cancelled: false };
  await assert.rejects(
    mapLimit(
      [1, 2, 3, 4, 5],
      2,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        job.cancelled = true;
        active--;
      },
      job,
    ),
    /cancelled/,
  );
  assert.equal(peak, 2);
});
test("cache honors TTL and bounds retention", () => {
  const { api } = fixture();
  const cache = new Cache(api.Platform.Storage, "test", 2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3, -100);
  cache.save();
  assert.equal(cache.get("a"), null);
  assert.equal(cache.get("c"), null);
  assert.equal(cache.get("b"), 2);
  assert.equal(Object.keys(api.Platform.Storage.get("test")).length, 2);
});
test("HTTP allowlist rejects redirects/untrusted destinations before fetch", async () => {
  let calls = 0;
  const request = makeHttp(async (_url, options) => {
    calls++;
    assert.equal(options.redirect, "error");
    return json({});
  });
  await assert.rejects(request("https://evil.example"), /not allowed/);
  await assert.rejects(request("http://api.spotify.com"), /not allowed/);
  await request("https://api.spotify.com/v1/me");
  assert.equal(calls, 1);
});
test("Spotify bearer token is restricted to Spotify; third-party requests have no auth header", async () => {
  const calls = [];
  const { client } = fixture(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("audioscrobbler")) return { toptags: { tag: [] } };
    return {};
  });
  await client.spotify("/me");
  await client.lastfm(
    { method: "artist.gettoptags", artist: "Example" },
    "lastfm-private",
  );
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-token");
  assert.equal(calls[1].options.headers, undefined);
  await assert.rejects(client.spotify("https://evil.example"), /Invalid/);
});
test("timeouts stop reads and mark writes as uncertain without retrying", async () => {
  let calls = 0;
  const request = makeHttp(
    () => {
      calls++;
      return new Promise(() => {});
    },
    { set: setTimeout, clear: clearTimeout },
    5,
  );
  await assert.rejects(
    request("https://api.spotify.com/v1/me/playlists", { method: "POST" }),
    (e) => e.unknown === true && !e.message.includes("token"),
  );
  assert.equal(calls, 1);
});
test("rate limits enter cooldown without automatic retry", async () => {
  let calls = 0;
  const request = makeHttp(async () => {
    calls++;
    return { ...json({}, 429), headers: { get: () => "1" } };
  });
  await assert.rejects(
    request("https://api.spotify.com/v1/me"),
    (e) => e.status === 429,
  );
  await assert.rejects(
    request("https://api.spotify.com/v1/me"),
    (e) => e.status === 429,
  );
  assert.equal(calls, 1);
});
test("collection reads all pages with new item schema and safe deprecated fallback", async () => {
  const calls = [];
  const { client } = fixture(async (url) => {
    calls.push(url);
    if (/\/items/.test(url)) throw new RequestError("old endpoint", 404);
    if (/\/tracks/.test(url))
      return url.includes("offset=0")
        ? {
            items: [{ item: { uri: uri(1), name: "First" } }],
            next: "untrusted next URL is not followed",
            total: 2,
          }
        : {
            items: [{ track: { uri: uri(2), name: "Second" } }],
            next: null,
            total: 2,
          };
    return { name: "Source" };
  });
  const result = await client.collection(playlist, { cancelled: false });
  assert.equal(result.tracks.length, 2);
  assert.ok(calls.some((x) => x.includes("offset=1")));
  assert.ok(calls.every((x) => x.startsWith("https://api.spotify.com/")));
});
test("incomplete playlist responses reject instead of exposing a partial preview", async () => {
  const { client } = fixture(async (url) =>
    url.includes("/items")
      ? { items: [], total: 5, next: "more" }
      : { name: "Source" },
  );
  await assert.rejects(
    client.collection(playlist, { cancelled: false }),
    /Incomplete/,
  );
});
test("native read fallback does not fabricate explicit flags and never writes", async () => {
  const { client } = fixture(async () => {
    throw new RequestError("forbidden", 403);
  });
  const result = await client.collection(playlist, { cancelled: false });
  assert.equal(result.tracks[0].explicit, null);
  assert.match(result.source, /Native/);
});
test("cancellation prevents further pagination", async () => {
  const job = { cancelled: false };
  const { client } = fixture(async (url) => {
    if (!url.includes("/items")) return { name: "Source" };
    job.cancelled = true;
    return { items: [{ track: { uri: uri(1) } }], next: "more", total: 2 };
  });
  await assert.rejects(client.collection(playlist, job), /cancelled/);
});
test("genre fallback proceeds track to album to artist and reports source", async () => {
  const calls = [];
  const { client } = fixture(async (url) => {
    calls.push(url);
    if (url.includes("artist.gettoptags"))
      return { toptags: { tag: [{ name: "hip hop", count: 100 }] } };
    return { toptags: { tag: [] } };
  });
  const result = await client.genres(
    track(1),
    { key: "ownkey", lastfmFirst: true },
    { cancelled: false },
  );
  assert.deepEqual(result.genres, ["hip hop"]);
  assert.equal(result.genreSource, "Last.fm artist tags");
  assert.equal(calls.length, 3);
});
test("Last.fm API errors are visible and never reveal the key", async () => {
  const { client } = fixture(async () => ({ error: 10, message: "secret" }));
  await assert.rejects(
    client.lastfm({ method: "x" }, "secret-key"),
    (e) => /code 10/.test(e.message) && !e.message.includes("secret"),
  );
});
test("missing Stats.fm counts remain unknown instead of becoming zero", async () => {
  const { client } = fixture(async () => ({
    items: [{ track: { name: "Track", externalIds: { spotify: [id(1)] } } }],
  }));
  const rows = await client.top("statsfm", "user", "", "month", "tracks");
  assert.equal(rows[0].count, null);
  assert.equal(rows[0].listenedMs, null);
});

test("writes require confirmation before any request", async () => {
  let calls = 0;
  const { client } = fixture(async () => {
    calls++;
  });
  await assert.rejects(
    client.createCopy([track(1)], "Copy", "", "yes", {}),
    /confirm/,
  );
  await assert.rejects(
    client.appendQueue([track(1)], "no", "yes", {}),
    /confirm/,
  );
  assert.equal(calls, 0);
});
test("copy creates a private new playlist and batches only into that new ID", async () => {
  const calls = [];
  const { client, values } = fixture(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/me/playlists") ? { uri: playlist } : {};
  });
  const result = await client.createCopy(
    Array.from({ length: 205 }, (_, i) => track(i)),
    "New copy",
    "yes",
    "yes",
    {},
  );
  assert.equal(result.completed, 205);
  assert.equal(calls.length, 4);
  assert.equal(JSON.parse(calls[0].options.body).public, false);
  assert.deepEqual(
    calls.slice(1).map((c) => JSON.parse(c.options.body).uris.length),
    [100, 100, 5],
  );
  assert.ok(
    calls.slice(1).every((c) => c.url.endsWith(`/playlists/${id(99)}/items`)),
  );
  assert.equal(values.get("last-write-v1").phase, "complete");
});
test("uncertain write retains partial copy and never repeats the failed batch", async () => {
  let calls = 0;
  const { client, values } = fixture(async (url) => {
    calls++;
    if (url.endsWith("/me/playlists")) return { uri: playlist };
    if (calls === 3)
      throw new RequestError("Write outcome is unknown.", 0, true);
    return {};
  });
  await assert.rejects(
    client.createCopy(
      Array.from({ length: 150 }, (_, i) => track(i)),
      "Copy",
      "yes",
      "yes",
      {},
    ),
    /Confirmed 100\/150/,
  );
  assert.equal(calls, 3);
  assert.equal(values.get("last-write-v1").uri, playlist);
  assert.equal(values.get("last-write-v1").phase, "unknown");
});
test("storage failure prevents writes, and queue caps prevent silent truncation", async () => {
  let calls = 0;
  const { client, api } = fixture(async () => {
    calls++;
  });
  api.Platform.Storage.set = () => {
    throw new Error("storage unavailable");
  };
  await assert.rejects(
    client.createCopy([track(1)], "Copy", "yes", "yes", {}),
    /storage/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    client.appendQueue(
      Array.from({ length: 101 }, (_, i) => track(i)),
      "yes",
      "yes",
      {},
    ),
    /limited/,
  );
  assert.equal(calls, 0);
});
test("queue append preserves preview order and records a partial failure", async () => {
  const calls = [];
  const { client, values } = fixture(async (url) => {
    calls.push(url);
    if (calls.length === 2) throw new RequestError("not permitted", 403);
    return null;
  });
  await assert.rejects(
    client.appendQueue([track(2), track(1), track(3)], "yes", "yes", {}),
    /Confirmed 1\/3/,
  );
  assert.equal(calls.length, 2);
  assert.ok(decodeURIComponent(calls[0]).endsWith(uri(2)));
  assert.equal(values.get("last-write-v1").completed, 1);
  assert.ok(calls.every((url) => url.includes("/me/player/queue?uri=")));
});
