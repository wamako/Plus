import test from "node:test";
import assert from "node:assert/strict";
import { DataClient } from "../shared/data.mjs";
import { RequestError } from "../shared/net.mjs";
import { collectionResponse } from "./fixtures/collection.mjs";

const trackUri = n => `spotify:track:${String(n).padStart(22, "0")}`;
const resolver = "https://spclient.wg.spotify.com/context-resolve/v1/spotify:user:self:collection";
const nextPage = "https://spclient.wg.spotify.com/collection-resolve/v2/user/self/collection?cursor=2";
const clientSecret = "client-credential-must-remain-native";
const accessSecret = "access-credential-not-needed-by-native-reader";
const jsonReply = value => ({ status: 200, encoding: "base64", body: Buffer.from(JSON.stringify(value)).toString("base64") });
const bytesReply = value => ({ status: 200, encoding: "base64", body: Buffer.from(value).toString("base64") });
const contextTrack = n => ({ uri: trackUri(n), metadata: { title: `Track ${n}`, artist_name: "Artist" } });
const oneContext = () => ({ uri: "spotify:user:self:collection", metadata: { track_count: "1" }, pages: [{ tracks: [contextTrack(1)] }] });

function fixture() {
  const storage = new Map(), reads = [], http = [];
  let tokenReads = 0, capabilityReads = 0, caps = { version: 1, transport: "native-client-auth-v1" };
  let respondNative = async () => ({ status: 403 });
  let respondHttp = async () => { throw new RequestError("Legacy HTTP 404", 404); };
  const session = {};
  Object.defineProperty(session, "accessToken", { get() { tokenReads++; return accessSecret; } });
  const api = {
    Platform: { Session: session, Storage: { get: key => storage.get(key), set: (key, value) => storage.set(key, value) } },
    User: { getCurrent: async () => ({ uri: "spotify:user:self", username: "self" }) },
    Player: { getState: () => ({ contextUri: "spotify:collection:tracks" }) },
    Internal: { getTrack: async uri => ({ uri, title: "Native metadata", artists: ["Artist"], album: { title: "Album" } }) },
    LikedSongs: {
      capabilities: async () => { capabilityReads++; return caps; },
      read: async args => {
        assert.equal(JSON.stringify(args).includes(accessSecret), false);
        assert.equal(JSON.stringify(args).includes(clientSecret), false);
        reads.push(structuredClone(args));
        return respondNative(args);
      },
    },
  };
  const client = new DataClient(api, async (url, options) => {
    http.push({ url, options });
    return respondHttp(url, options);
  });
  return { client, api, reads, http, tokenReads: () => tokenReads, capabilityReads: () => capabilityReads,
    native: fn => { respondNative = fn; }, legacy: fn => { respondHttp = fn; },
    capabilities: value => { caps = value; } };
}

test("capability-advertised native context reads every page without JS credential-bearing HTTP", async () => {
  const f = fixture();
  f.native(async args => {
    assert.equal(args.kind, "context");
    if (args.url === resolver) return jsonReply({
      uri: "spotify:user:self:collection", metadata: { track_count: "2" },
      pages: [{ tracks: [contextTrack(1)], next_page_url: "hm://collection-resolve/v2/user/self/collection?cursor=2" }],
    });
    assert.equal(args.url, nextPage);
    return jsonReply({ tracks: [contextTrack(2)] });
  });
  const result = await f.client.likedSongs({}, () => {}, "self");
  assert.deepEqual(result.tracks.map(t => t.uri), [trackUri(1), trackUri(2)]);
  assert.ok(result.tracks.every(t => t.liked));
  assert.deepEqual(f.reads, [{ kind: "context", url: resolver }, { kind: "context", url: nextPage }]);
  assert.deepEqual(f.http, []);
  assert.equal(f.tokenReads(), 0);
  assert.equal(f.capabilityReads(), 1);
});

test("native saved-collection transport preserves binary paging, removal filtering and timestamps", async () => {
  const f = fixture();
  f.native(async args => {
    assert.equal(args.kind, "collection");
    return args.cursor === ""
      ? bytesReply(collectionResponse([{ uri: trackUri(1), seconds: 1700000000 }, { uri: trackUri(9), removed: true }], "next"))
      : bytesReply(collectionResponse([{ uri: trackUri(2), seconds: 1700000010 }], ""));
  });
  const result = await f.client.likedCollection("self", {}, () => {});
  assert.deepEqual(result.tracks.map(t => t.uri), [trackUri(1), trackUri(2)]);
  assert.deepEqual(result.tracks.map(t => t.addedAt), [1700000000000, 1700000010000]);
  assert.deepEqual(f.reads, [
    { kind: "collection", username: "self", cursor: "", limit: 100 },
    { kind: "collection", username: "self", cursor: "next", limit: 100 },
  ]);
  assert.deepEqual(f.http, []);
  assert.equal(f.tokenReads(), 0);
});

test("supported native forbidden responses preserve HTTP status without credential/body disclosure or HTTP downgrade", async () => {
  for (const kind of ["context", "collection"]) {
    const f = fixture();
    f.native(async () => ({ status: 403, encoding: "base64", body: Buffer.from(clientSecret).toString("base64") }));
    const read = kind === "context" ? f.client.likedContext("self", {}, () => {}) : f.client.likedCollection("self", {}, () => {});
    await assert.rejects(read, error => {
      assert.ok(error.status === 403 || /HTTP 403/.test(error.message));
      assert.equal(error.message.includes(clientSecret), false);
      assert.equal(error.message.includes(accessSecret), false);
      return true;
    });
    assert.equal(f.reads.length, 1);
    assert.deepEqual(f.http, []);
  }
});

test("native rate limits stop the complete Liked Songs operation before any alternate route", async () => {
  const f = fixture();
  f.native(async () => ({ status: 429 }));
  await assert.rejects(f.client.likedSongs({}, () => {}, "self"), /429/);
  assert.equal(f.reads.length, 1);
  assert.deepEqual(f.http, []);
});

test("cancellation during a native read discards its response and does not continue paging", async () => {
  const f = fixture(), job = {};
  f.native(async () => { job.cancelled = true; return jsonReply(oneContext()); });
  await assert.rejects(f.client.likedSongs(job, () => {}, "self"), /cancelled/i);
  assert.equal(f.reads.length, 1);
  assert.deepEqual(f.http, []);
});

test("native context still refuses partial membership and repeated pages", async () => {
  for (const response of [
    { metadata: { track_count: "2" }, pages: [{ tracks: [contextTrack(1)] }] },
    { pages: [{ tracks: [contextTrack(1)], next_page_url: "hm://collection-resolve/v2/user/self/collection?cursor=repeat" }] },
  ]) {
    const f = fixture();
    f.native(async args => args.url === resolver ? jsonReply(response) : jsonReply({ tracks: [contextTrack(1)], next_page_url: "hm://collection-resolve/v2/user/self/collection?cursor=repeat" }));
    await assert.rejects(f.client.likedContext("self", {}, () => {}), /incomplete|repeated|loop/i);
    assert.ok(f.reads.length > 0);
    assert.deepEqual(f.http, []);
  }
});

test("malformed native envelopes never become successful empty or partial previews", async () => {
  for (const response of [
    { status: 200, encoding: "base64", body: "!!!" },
    { status: 200, encoding: "utf8", body: JSON.stringify(oneContext()) },
    { status: 200, encoding: "base64" },
    { status: "200", encoding: "base64", body: Buffer.from(JSON.stringify(oneContext())).toString("base64") },
  ]) {
    const f = fixture();
    f.native(async () => response);
    await assert.rejects(f.client.likedContext("self", {}, () => {}));
    assert.equal(f.reads.length, 1);
    assert.deepEqual(f.http, []);
  }
});

test("legacy hosts and unsupported capability versions retain the existing context HTTP reader", async () => {
  for (const capability of [null, { version: 2, transport: "native-client-auth-v1" }, { version: 1, transport: "unknown" }]) {
    const f = fixture();
    if (capability === null) delete f.api.LikedSongs;
    else f.capabilities(capability);
    f.legacy(async (url, options) => {
      assert.equal(url, resolver);
      assert.equal(options.headers.Authorization, `Bearer ${accessSecret}`);
      return oneContext();
    });
    const result = await f.client.likedContext("self", {}, () => {});
    assert.deepEqual(result.tracks.map(t => t.uri), [trackUri(1)]);
    assert.deepEqual(f.reads, []);
    assert.equal(f.http.length, 1);
  }
});

test("native JSON at the four-MiB transport bound decodes without recursive base64 matching", async () => {
  const f = fixture();
  const json = JSON.stringify(oneContext());
  const bytes = Buffer.from(json + " ".repeat(4 * 1024 * 1024 - Buffer.byteLength(json)));
  assert.equal(bytes.length, 4 * 1024 * 1024);
  f.native(async () => bytesReply(bytes));
  const result = await f.client.likedContext("self", {}, () => {});
  assert.deepEqual(result.tracks.map(t => t.uri), [trackUri(1)]);
  assert.deepEqual(f.http, []);
});
