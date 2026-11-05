import test from "node:test";
import assert from "node:assert/strict";
import { DataClient } from "../shared/data.mjs";
import { RequestError, makeHttp } from "../shared/net.mjs";
import {
  LIKED_URI,
  likedInput,
  encodeCollectionPage,
  decodeCollectionPage,
  contextPageUrl,
} from "../shared/liked-songs.mjs";
const id = (n) => String(n).padStart(22, "0"),
  uri = (n) => `spotify:track:${id(n)}`;
// Independent response fixtures: field tags come from collection2v2.proto.
import { collectionResponse } from "./fixtures/collection.mjs";
function fixture() {
  const calls = [],
    store = new Map();
  const api = {
    Platform: {
      Session: { accessToken: "test-token" },
      Storage: {
        get: (key) => store.get(key),
        set: (key, value) => store.set(key, value),
      },
    },
    User: {
      getCurrent: async () => ({ uri: "spotify:user:self", username: "self" }),
    },
    Player: { getState: () => ({ contextUri: LIKED_URI }) },
    Internal: {
      getTrack: async (uri) => ({
        uri,
        title: `Track ${uri.slice(-1)}`,
        artists: ["Artist"],
        album: { title: "Album" },
        durationMs: 100000,
      }),
    },
    Playlists: {
      get: async () =>
        assert.fail("Liked Songs must not use a playlist reader"),
    },
  };
  let respond = async () => {
    throw new RequestError("HTTP 404", 404);
  };
  const client = new DataClient(api, async (url, options = {}) => {
    calls.push({ url, options });
    return respond(url, options);
  });
  return {
    client,
    api,
    calls,
    respond: (fn) => {
      respond = fn;
    },
  };
}
test("Liked Songs recognizes canonical, personal and collection links without mapping ordinary playlists", () => {
  for (const value of [
    LIKED_URI,
    "spotify:collection",
    "https://open.spotify.com/collection/tracks?si=abc",
    "https://open.spotify.com/intl-en/collection/tracks",
  ])
    assert.equal(likedInput(value).uri, LIKED_URI);
  assert.equal(
    likedInput("spotify:user:account-123:collection").username,
    "account-123",
  );
  assert.equal(
    likedInput("spotify:user:account-123:collection:tracks").username,
    "account-123",
  );
  for (const value of [
    "spotify:playlist:" + id(1),
    "spotify:user:self:collection:artist:" + id(1),
    "https://evil.example/collection/tracks",
    "spotify:user:bad%3Aname:collection",
  ])
    assert.equal(likedInput(value), null);
});
test("collection request wire bytes encode exact schema and enforce a bounded page size", () => {
  assert.equal(
    Buffer.from(encodeCollectionPage("self", "", 100)).toString("hex"),
    "0a0473656c66120a636f6c6c656374696f6e1a002064",
  );
  assert.throws(() => encodeCollectionPage("self", "", 101));
  assert.throws(() => encodeCollectionPage("bad/name"));
  assert.throws(() => encodeCollectionPage("self", "a".repeat(17000)));
});
test("collection response distinguishes tracks, removed rows, timestamps and next-page cursor", () => {
  const result = decodeCollectionPage(
    collectionResponse(
      [
        { uri: uri(1), seconds: 1700000000 },
        { uri: uri(2), removed: true },
      ],
      "next",
    ),
  );
  assert.equal(result.items[0].addedAt, 1700000000000);
  assert.equal(result.items[1].removed, true);
  assert.equal(result.next, "next");
  assert.equal(result.sync, "snapshot");
});
test("malformed/truncated collection messages cannot be accepted as an empty library", () => {
  for (const bytes of [
    Buffer.from([]),
    Buffer.from([10, 100, 1]),
    Buffer.from([8, 1]),
    Buffer.from([10, 0]),
    Buffer.from([0]),
    Buffer.from([18, 2, 255, 255]),
  ])
    assert.throws(() => decodeCollectionPage(bytes));
});
test("context page normalization confines Spotify credentials to the exact trusted host", () => {
  assert.equal(
    contextPageUrl("hm://collection-resolve/next?p=2"),
    "https://spclient.wg.spotify.com/collection-resolve/next?p=2",
  );
  assert.equal(
    contextPageUrl("/collection/next"),
    "https://spclient.wg.spotify.com/collection/next",
  );
  for (const value of [
    "https://evil.example/next",
    "//evil.example/x",
    "https://spclient.wg.spotify.com.evil.example/x",
    "http://spclient.wg.spotify.com/x",
    "https://user@spclient.wg.spotify.com/x",
  ])
    assert.throws(() => contextPageUrl(value));
});
test("dedicated collection loader reads every page, excludes albums and removed tracks, and hydrates only likes", async () => {
  const { client, calls, respond } = fixture();
  let pages = 0;
  respond(async (url, options) => {
    assert.ok(url.endsWith("/collection/v2/paging"));
    assert.equal(options.readOnly, true);
    assert.equal(options.headers.Authorization, "Bearer test-token");
    pages++;
    return pages === 1
      ? collectionResponse(
          [
            { uri: uri(1), seconds: 1700000000 },
            { uri: `spotify:album:${id(9)}` },
            { uri: uri(3), removed: true },
          ],
          "page2",
        )
      : collectionResponse([{ uri: uri(2), seconds: 1700000010 }]);
  });
  const data = await client.collection(LIKED_URI, {});
  assert.equal(data.name, "Liked Songs");
  assert.deepEqual(
    data.tracks.map((t) => t.uri),
    [uri(1), uri(2)],
  );
  assert.ok(data.tracks.every((t) => t.liked === true));
  assert.equal(data.tracks[0].addedAt, 1700000000000);
  assert.equal(pages, 2);
  assert.ok(Buffer.from(calls[1].options.body).includes(Buffer.from("page2")));
});
test("explicit personal collection URI supplies the account without a profile request", async () => {
  const { client, api, respond } = fixture();
  api.User.getCurrent = async () =>
    assert.fail("URI already identifies account");
  respond(async () => collectionResponse([]));
  assert.equal(
    (await client.collection("spotify:user:self:collection", {})).tracks.length,
    0,
  );
});
test("saved-tracks API is tried independently when native collection paging is unavailable", async () => {
  const { client, calls, respond } = fixture();
  respond(async (url) => {
    if (url.includes("/collection/v2/paging"))
      throw new RequestError("missing", 404);
    if (url.includes("/me/tracks"))
      return {
        items: [
          {
            added_at: "2026-01-01T00:00:00Z",
            track: { uri: uri(1), name: "Saved" },
          },
        ],
        total: 1,
        next: null,
      };
    assert.fail(url);
  });
  const data = await client.collection(LIKED_URI, {});
  assert.equal(data.tracks.length, 1);
  assert.equal(data.tracks[0].liked, true);
  assert.match(data.source, /saved-tracks/);
  assert.ok(calls.every((c) => !c.url.includes("/playlists/")));
});
test("saved-tracks API pagination loads 101 likes in order rather than stopping at page one", async () => {
  const { client, respond } = fixture();
  let pages = 0;
  respond(async (url) => {
    if (url.includes("/collection/v2/paging"))
      throw new RequestError("missing", 404);
    const offset = Number(new URL(url).searchParams.get("offset"));
    pages++;
    const count = Math.min(50, 101 - offset);
    return {
      items: Array.from({ length: count }, (_, i) => ({
        track: { uri: uri(offset + i + 1), name: `Track ${offset + i + 1}` },
      })),
      total: 101,
      next: offset + count < 101 ? "unused next URL" : null,
    };
  });
  const data = await client.collection(LIKED_URI, {});
  assert.equal(data.tracks.length, 101);
  assert.equal(data.tracks.at(-1).uri, uri(101));
  assert.equal(pages, 3);
});
test("Liked Songs context fallback follows next-page URLs when the Web API returns 404", async () => {
  const { client, respond } = fixture();
  respond(async (url) => {
    if (url.includes("context-resolve"))
      return {
        uri: "spotify:user:self:collection",
        pages: [
          {
            tracks: [{ uri: uri(1) }],
            next_page_url: "hm://collection-resolve/page2",
          },
        ],
      };
    if (url.includes("collection-resolve/page2"))
      return { tracks: [{ uri: uri(2) }] };
    throw new RequestError("404", 404);
  });
  const data = await client.collection(LIKED_URI, {});
  assert.deepEqual(
    data.tracks.map((t) => t.uri),
    [uri(1), uri(2)],
  );
  assert.match(data.source, /context/);
});
test("preloaded context pages referenced by a next link are not fetched or counted twice", async () => {
  const { client, respond } = fixture();
  respond(async (url) => {
    if (url.includes("context-resolve"))
      return {
        pages: [
          {
            page_url: "hm://collection/page1",
            tracks: [{ uri: uri(1) }],
            next_page_url: "hm://collection/page2",
          },
          { page_url: "hm://collection/page2", tracks: [{ uri: uri(2) }] },
        ],
      };
    throw new RequestError("404", 404);
  });
  assert.equal((await client.collection(LIKED_URI, {})).tracks.length, 2);
});
test("cursor loops, changing snapshots, duplicate tracks and empty continuation pages reject the whole preview", async () => {
  for (const mode of ["loop", "snapshot", "duplicate", "empty"]) {
    const { client, respond } = fixture();
    let n = 0;
    respond(async (url) => {
      if (!url.includes("/collection/v2/paging"))
        throw new RequestError("404", 404);
      n++;
      if (n === 1) return collectionResponse([{ uri: uri(1) }], "next");
      return collectionResponse(
        mode === "empty"
          ? []
          : [{ uri: mode === "duplicate" ? uri(1) : uri(2) }],
        mode === "loop" || mode === "empty" ? "next" : "",
        mode === "snapshot" ? "changed" : "snapshot",
      );
    });
    await assert.rejects(
      client.collection(LIKED_URI, {}),
      /Liked Songs could not be read/,
    );
  }
});
test("cancelling after a saved page prevents further reads and any incomplete preview", async () => {
  const { client, respond, calls } = fixture(),
    job = { cancelled: false };
  respond(async () => {
    job.cancelled = true;
    return collectionResponse([{ uri: uri(1) }], "next");
  });
  await assert.rejects(client.collection(LIKED_URI, job), /cancelled/);
  assert.equal(calls.length, 1);
});
test("unknown account can fall back to the saved-tracks API without guessing another user", async () => {
  const { client, api, respond } = fixture();
  api.User.getCurrent = async () => {
    throw new Error("Profile unavailable");
  };
  respond(async (url) =>
    url.includes("/me/tracks")
      ? { items: [], total: 0, next: null }
      : Promise.reject(new RequestError("404", 404)),
  );
  const data = await client.collection(LIKED_URI, {});
  assert.equal(data.tracks.length, 0);
  assert.match(data.source, /saved-tracks/);
});
test("collection rate limits stop rather than switching to another transport", async () => {
  const { client, respond, calls } = fixture();
  respond(async () => {
    throw new RequestError("limited", 429);
  });
  await assert.rejects(client.collection(LIKED_URI, {}), /429/);
  assert.equal(calls.length, 1);
});
test("read-only protobuf POSTs parse bytes and never report an uncertain write", async () => {
  const request = makeHttp(
    async () => new Response(collectionResponse([]), { status: 200 }),
  );
  const bytes = await request(
    "https://spclient.wg.spotify.com/collection/v2/paging",
    { method: "POST", readOnly: true, responseType: "bytes" },
  );
  assert.equal(decodeCollectionPage(bytes).items.length, 0);
  const timeout = makeHttp(
    () => new Promise(() => {}),
    { set: setTimeout, clear: clearTimeout },
    2,
  );
  await assert.rejects(
    timeout("https://spclient.wg.spotify.com/collection/v2/paging", {
      method: "POST",
      readOnly: true,
      responseType: "bytes",
    }),
    (error) => error.unknown === false && /Read request/.test(error.message),
  );
  await assert.rejects(
    request("https://api.spotify.com/v1/me/playlists", {
      method: "POST",
      readOnly: true,
    }),
    /Invalid read-only POST/,
  );
});

test("unavailable catalog metadata retains the saved URI and date without blocking other likes or guessing genres", async () => {
  const { client, api, respond } = fixture();
  const original = api.Internal.getTrack;
  api.Internal.getTrack = async (value) =>
    value === uri(2) ? null : original(value);
  respond(async (url) => {
    if (url.endsWith("/collection/v2/paging"))
      return collectionResponse([
        { uri: uri(1), seconds: 1700000000 },
        { uri: uri(2), seconds: 1700000001 },
      ]);
    throw new RequestError("not found", 404);
  });
  const data = await client.collection(LIKED_URI, {});
  assert.equal(data.tracks.length, 2);
  assert.equal(data.tracks[1].uri, uri(2));
  assert.equal(data.tracks[1].addedAt, 1700000001000);
  assert.equal(data.tracks[1].liked, true);
  assert.equal(data.tracks[1].metadataUnavailable, true);
  assert.deepEqual(
    (await client.genres(data.tracks[1], { key: "unused" }, {})).genres,
    [],
  );
});
