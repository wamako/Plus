import test from "node:test";
import assert from "node:assert/strict";
import { DataClient } from "../shared/data.mjs";
import { RequestError, mapLimit } from "../shared/net.mjs";
import {
  gidToUri,
  uriToHex,
  rawTrack,
  withAlbum,
  nativeGenres,
} from "../shared/native-metadata.mjs";
const id = (n) => String(n).padStart(22, "0"),
  uri = (n) => `spotify:track:${id(n)}`,
  albumUri = `spotify:album:${id(8)}`,
  artistUri = `spotify:artist:${id(7)}`,
  playlistUri = `spotify:playlist:${id(9)}`;
function fixture() {
  const values = new Map(),
    calls = [];
  const storage = {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, structuredClone(value)),
  };
  const track = (n) => ({
    uri: uri(n),
    title: `Native ${n}`,
    artist: "Artist",
    artists: ["Artist"],
    durationMs: 123000,
    album: { title: "Native album", image: "" },
    explicit: false,
  });
  const album = {
    uri: albumUri,
    name: "Native album",
    artists: [{ name: "Artist", uri: artistUri }],
    date: { year: 2026, month: 11, day: 1 },
    type: "ALBUM",
    discs: [
      { number: 1, tracks: [uri(1), uri(2)] },
      { number: 2, tracks: [uri(1), uri(3)] },
    ],
  };
  const api = {
    Platform: { Storage: storage, Session: { accessToken: "spotify-test" } },
    Internal: {
      getAlbum: async (input) => {
        calls.push(["album", input]);
        return album;
      },
      getTrack: async (input) => {
        calls.push(["track", input]);
        return track(Number(input.split(":").at(-1)));
      },
      getArtist: async (input) => {
        calls.push(["artist", input]);
        return { raw: { genre: ["hip hop", "rap"] } };
      },
      getPlaylist: async () => ({
        uri: playlistUri,
        name: "Native playlist",
        position: 0,
        length: 3,
        truncated: false,
        items: [
          { uri: uri(1), timestamp: "1700000000000" },
          { uri: uri(2) },
          { uri: uri(1) },
        ],
      }),
    },
    Playlists: {
      get: async () => {
        throw new Error("Old RPC unavailable");
      },
    },
    Player: { getCurrentTrack: () => track(1) },
  };
  let request = async (url, options) => {
    calls.push(["http", url, options]);
    throw new RequestError("api.spotify.com returned HTTP 404.", 404);
  };
  const client = new DataClient(api, (...args) => request(...args));
  return {
    client,
    api,
    values,
    calls,
    album,
    track,
    setRequest: (fn) => {
      request = fn;
    },
  };
}
test("metadata GIDs round-trip to exact Spotify identifiers without integer precision loss", () => {
  for (const hex of [
    "00000000000000000000000000000001",
    "0123456789abcdef0123456789abcdef",
    "ffffffffffffffffffffffffffffffff",
  ])
    assert.equal(uriToHex(gidToUri("track", hex)), hex);
  assert.equal(gidToUri("track", "bad"), "");
  assert.throws(() => uriToHex("spotify:track:" + "Z".repeat(22)), /128 bits/);
});
test("raw track metadata preserves real artist and album IDs and leaves absent flags unknown", () => {
  const result = rawTrack(
    {
      name: "Title",
      artist: [{ name: "Artist", gid: uriToHex(artistUri) }],
      album: { name: "Album", gid: uriToHex(albumUri) },
      duration: 123000,
    },
    uri(1),
  );
  assert.equal(result.artists[0].uri, artistUri);
  assert.equal(result.albumUri, albumUri);
  assert.equal(result.explicit, null);
  assert.equal(result.popularity, null);
});
test("album enrichment matches artist names without relabeling guests as the album artist", () => {
  const result = withAlbum(
    {
      artists: [
        { name: "Artist", uri: "" },
        { name: "Guest", uri: "" },
      ],
      album: "",
      albumUri: "",
      image: "",
      releaseDate: "",
      releaseType: "",
    },
    {
      uri: albumUri,
      artists: [{ name: "Artist", uri: artistUri }],
      date: { year: 2026 },
      name: "Album",
    },
  );
  assert.equal(result.artists[0].uri, artistUri);
  assert.equal(result.artists[1].uri, "");
  assert.equal(result.releaseDate, "2026");
});
test("album contexts use native multi-disc metadata, preserve duplicate occurrences and never require the Web API", async () => {
  const { client, calls } = fixture();
  const result = await client.collection(albumUri, {}, () => {});
  assert.deepEqual(
    result.tracks.map((t) => t.uri),
    [uri(1), uri(2), uri(1), uri(3)],
  );
  assert.equal(result.tracks[0].artists[0].uri, artistUri);
  assert.equal(result.tracks[0].releaseDate, "2026-11-01");
  assert.equal(result.tracks[0].explicit, null);
  assert.match(result.source, /Native album/);
  assert.equal(calls.filter((c) => c[0] === "http").length, 0);
});
test("native playlist metadata avoids old obfuscated RPCs and preserves timestamps and duplicates", async () => {
  const { client, calls } = fixture();
  const result = await client.collection(playlistUri, {});
  assert.equal(result.tracks.length, 3);
  assert.equal(result.tracks[0].addedAt, 1700000000000);
  assert.deepEqual(
    result.tracks.map((t) => t.uri),
    [uri(1), uri(2), uri(1)],
  );
  assert.equal(calls.filter((c) => c[0] === "http").length, 0);
});
test("genre classification works from native album artist IDs while all public API endpoints are unavailable", async () => {
  const { client, calls } = fixture();
  const collection = await client.collection(albumUri, {});
  const result = await client.classify(collection.tracks, {}, {});
  assert.ok(result.every((t) => t.genres.includes("hip hop")));
  assert.equal(calls.filter((c) => c[0] === "http").length, 0);
  assert.equal(
    calls.filter((c) => c[0] === "artist").length,
    1,
    "concurrent tracks share the same artist read",
  );
});
test("current-track genre lookup recovers artist IDs from Spotify metadata without a Web API track read", async () => {
  const { client, calls, setRequest } = fixture();
  setRequest(async (url, options) => {
    calls.push(["http", url, options]);
    assert.ok(
      url.startsWith("https://spclient.wg.spotify.com/metadata/4/track/"),
    );
    assert.equal(options.headers.Authorization, "Bearer spotify-test");
    return {
      name: "Native 1",
      artist: [{ name: "Artist", gid: uriToHex(artistUri) }],
    };
  });
  const track = await client.track(uri(1));
  assert.equal(track.artists[0].uri, "");
  const result = await client.genres(track, {}, {});
  assert.deepEqual(result.genres, ["hip hop", "rap"]);
  assert.ok(
    calls.every((c) => c[0] !== "http" || !c[1].includes("api.spotify.com")),
  );
});
test("no-genre failures stay unknown, show actionable diagnostics, and are not cached across retries", async () => {
  const { client, api, setRequest, values } = fixture();
  api.Internal.getArtist = async () => null;
  setRequest(async () => {
    throw new RequestError("forbidden", 403);
  });
  const collection = await client.collection(albumUri, {});
  let result = await client.genres(collection.tracks[0], {}, {});
  assert.deepEqual(result.genres, []);
  assert.match(result.genreStatus, /HTTP 403/);
  assert.match(result.genreStatus, /Last.fm/);
  assert.ok(
    !Object.keys(values.get("metadata-cache-v2")).some((key) =>
      key.startsWith("genres:"),
    ),
  );
  api.Internal.getArtist = async () => ({ raw: { genre: ["soul"] } });
  result = await client.genres(collection.tracks[0], {}, {});
  assert.deepEqual(result.genres, ["soul"]);
});
test("unavailable raw artist identifiers can still use Last.fm name lookup without exposing a Spotify token", async () => {
  const { client, setRequest } = fixture();
  setRequest(async (url, options) => {
    if (url.includes("spclient")) throw new RequestError("blocked", 403);
    assert.ok(url.startsWith("https://ws.audioscrobbler.com/"));
    assert.equal(options?.headers?.Authorization, undefined);
    return { toptags: { tag: [{ name: "soul" }] } };
  });
  const result = await client.genres(
    await client.track(uri(1)),
    { key: "user-key" },
    {},
  );
  assert.deepEqual(result.genres, ["soul"]);
  assert.equal(result.genreSource, "Last.fm track tags");
});
test("a Last.fm not-found response falls through from track to album tags", async () => {
  const { client, setRequest } = fixture();
  const methods = [];
  setRequest(async (url) => {
    const method = new URL(url).searchParams.get("method");
    methods.push(method);
    return method === "track.gettoptags"
      ? { error: 6, message: "Track not found" }
      : { toptags: { tag: [{ name: "jazz" }] } };
  });
  const result = await client.genres(
    await client.track(uri(1)),
    { key: "own-key", lastfmFirst: true },
    {},
  );
  assert.deepEqual(result.genres, ["jazz"]);
  assert.deepEqual(methods, ["track.gettoptags", "album.gettoptags"]);
});
test("native album failure falls back to public reads when available", async () => {
  const { client, api, setRequest } = fixture();
  api.Internal.getAlbum = async () => {
    throw new Error("unavailable native service");
  };
  setRequest(async (url) =>
    url.includes("/tracks?")
      ? { items: [{ uri: uri(1), name: "Web track" }], total: 1, next: null }
      : { name: "Web album" },
  );
  const result = await client.collection(albumUri, {});
  assert.equal(result.name, "Web album");
  assert.equal(result.tracks.length, 1);
  assert.match(result.source, /Web API/);
});
test("both native and public album failures include stage and status without exposing credentials", async () => {
  const { client, api } = fixture();
  api.Internal.getAlbum = async () => null;
  await assert.rejects(
    client.collection(albumUri, {}),
    (error) =>
      /Native album metadata: album metadata unavailable/.test(error.message) &&
      /Spotify Web API: HTTP 404/.test(error.message) &&
      !error.message.includes("spotify-test"),
  );
});
test("truncated native playlists are rejected and never shown as complete", async () => {
  const { client, api } = fixture();
  api.Internal.getPlaylist = async () => ({
    position: 0,
    length: 100,
    items: [{ uri: uri(1) }],
    truncated: true,
  });
  await assert.rejects(
    client.collection(playlistUri, {}),
    /Incomplete native playlist response/,
  );
});
test("metadata native rate limits do not trigger public API fallback", async () => {
  const { client, api, calls } = fixture();
  api.Internal.getAlbum = async () => {
    throw new Error("Spotify album request failed: 429");
  };
  await assert.rejects(client.collection(albumUri, {}), /429/);
  assert.equal(calls.filter((c) => c[0] === "http").length, 0);
});
test("cancellation during native album load prevents track requests and alternate transports", async () => {
  const { client, api, calls, album } = fixture(),
    job = { cancelled: false };
  api.Internal.getAlbum = async () => {
    job.cancelled = true;
    return album;
  };
  await assert.rejects(client.collection(albumUri, job), /cancelled/);
  assert.equal(calls.length, 0);
});
test("a failed metadata worker waits for in-flight reads and stops scheduling new work", async () => {
  const seen = [];
  await assert.rejects(
    mapLimit([1, 2, 3, 4], 2, async (value) => {
      seen.push(value);
      if (value === 1) throw new Error("first failed");
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push("finished");
    }),
    /first failed/,
  );
  assert.deepEqual(seen, [1, 2, "finished"]);
});
test("native genre labels support both metadata genre and genres fields", () => {
  assert.deepEqual(
    nativeGenres({ raw: { genre: ["hiphop"], genres: ["rnb"] } }),
    ["hip hop", "r&b"],
  );
});

test("healthy but empty genre results do not persist a negative artist cache", async () => {
  const { client, api, setRequest, values } = fixture();
  api.Internal.getArtist = async () => ({ raw: { genre: [] } });
  setRequest(async () => ({ genres: [] }));
  const collection = await client.collection(albumUri, {});
  assert.deepEqual(
    (await client.genres(collection.tracks[0], {}, {})).genres,
    [],
  );
  assert.ok(
    !Object.keys(values.get("metadata-cache-v2")).some((key) =>
      key.startsWith("artist-genres:"),
    ),
  );
  api.Internal.getArtist = async () => ({ raw: { genre: ["ambient"] } });
  assert.deepEqual((await client.genres(collection.tracks[0], {}, {})).genres, [
    "ambient",
  ]);
});
test("current album genre lookup recovers artist IDs using only host metadata even if direct HTTP would fail", async () => {
  const { client, api, calls } = fixture();
  api.Player.getState = () => ({ trackUri: uri(1), contextUri: albumUri });
  const current = await client.track(uri(1));
  const result = await client.genres(current, {}, {});
  assert.deepEqual(result.genres, ["hip hop", "rap"]);
  assert.equal(calls.filter((call) => call[0] === "http").length, 0);
});
