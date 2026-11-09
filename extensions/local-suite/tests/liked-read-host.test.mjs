import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DataClient } from "../shared/data.mjs";
import { collectionResponse } from "./fixtures/collection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = await fs.realpath(path.join(root, "node_modules/spotifyplus"));
process.env.NODE_PATH = path.join(sdk, "node_modules");
Module._initPaths();
// This override permits honest RED against the previously shipped R21 runtime.
const host = path.resolve(process.env.SPOTIFYPLUS_HOST_RUNTIME || path.join(sdk, "../nodejs"));
const { ScriptApiFactory } = await import(pathToFileURL(path.join(host, "loader/script-api.js")));
const { ScriptRegistry } = await import(pathToFileURL(path.join(host, "loader/script-registry.js")));
const identity = "com.wamako.ci.likedread";
const uri = n => `spotify:track:${String(n).padStart(22, "0")}`;
const resolver = "https://spclient.wg.spotify.com/context-resolve/v1/spotify:user:self:collection";
const secondPage = "https://spclient.wg.spotify.com/collection-resolve/v2/user/self/collection?cursor=2";
const capability = { version: 1, transport: "native-client-auth-v1" };
const envelope = value => ({ status: 200, encoding: "base64", body: Buffer.from(value).toString("base64") });
const jsonEnvelope = value => envelope(JSON.stringify(value));
const track = n => ({ uri: uri(n), metadata: { title: `Track ${n}`, artist_name: "Artist" } });

function fixture(t, read) {
  const calls = [], values = new Map();
  const logger = { child() { return this; }, info() {}, warn() {}, error() {} };
  const registry = new ScriptRegistry(logger, () => {});
  const forbidden = () => assert.fail("Native read used the synchronous, legacy HTTP, or token path");
  const session = {};
  Object.defineProperty(session, "accessToken", { get: forbidden });
  const runtime = {
    registry, platformData: {}, session,
    ui: { forExtension(script, generation) { assert.equal(script, identity); assert.equal(generation, 1); return {}; } },
    callApiSync: forbidden, request: forbidden,
    requestApi: async (operation, args) => {
      calls.push({ operation, args: args === undefined ? undefined : structuredClone(args) });
      if (operation === "liked.capabilities") return capability;
      if (operation === "liked.account") return { username: "self" };
      assert.equal(operation, "liked.read");
      return read(args);
    },
    storageGet(script, key) { assert.equal(script, identity); return values.get(key); },
    storageSet(script, key, value) { assert.equal(script, identity); values.set(key, structuredClone(value)); },
    getTrack: async selected => ({ uri: selected, title: "Native track", artists: ["Artist"], album: { title: "Album" } }),
  };
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "spotifyplus-liked-read-"));
  t.after(() => fsSync.rmSync(directory, { recursive: true, force: true }));
  fsSync.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ id: identity, api: 2, main: "index.js", version: "1.0.0" }));
  const api = new ScriptApiFactory(runtime, logger).create(identity, 1, directory, directory, [], "user").SpotifyPlus;
  t.after(() => registry.unregisterScript(identity));
  assert.equal(typeof api.LikedSongs?.capabilities, "function", "Pinned host did not expose the Liked Songs native facade");
  assert.equal(typeof api.LikedSongs?.read, "function");
  return { api, calls, client: new DataClient(api, forbidden) };
}

test("actual pinned API factory delegates native Liked Songs capability and read through asynchronous requestApi", async t => {
  const response = jsonEnvelope({ pages: [{ tracks: [track(1)] }] });
  const f = fixture(t, async () => response);
  assert.deepEqual(await f.api.LikedSongs.capabilities(), capability);
  const args = { kind: "context", url: resolver };
  assert.deepEqual(await f.api.LikedSongs.read(args), response);
  assert.deepEqual(f.calls, [
    { operation: "liked.capabilities", args: undefined },
    { operation: "liked.read", args },
  ]);
});

test("DataClient reads a complete multi-page context through the actual factory with no legacy or session-token read", async t => {
  const f = fixture(t, async args => {
    assert.equal(args.kind, "context");
    if (args.url === resolver) return jsonEnvelope({
      uri: "spotify:user:self:collection", metadata: { track_count: "2" },
      pages: [{ tracks: [track(1)], next_page_url: "hm://collection-resolve/v2/user/self/collection?cursor=2" }],
    });
    assert.equal(args.url, secondPage);
    return jsonEnvelope({ tracks: [track(2)] });
  });
  const result = await f.client.likedSongs({}, () => {}, "self");
  assert.deepEqual(result.tracks.map(row => row.uri), [uri(1), uri(2)]);
  assert.ok(result.tracks.every(row => row.liked));
  assert.deepEqual(f.calls, [
    { operation: "liked.capabilities", args: undefined },
    { operation: "liked.read", args: { kind: "context", url: resolver } },
    { operation: "liked.read", args: { kind: "context", url: secondPage } },
  ]);
});

test("actual factory preserves native collection binary envelopes and cursor paging", async t => {
  const f = fixture(t, async args => {
    assert.equal(args.kind, "collection");
    return args.cursor === ""
      ? envelope(collectionResponse([{ uri: uri(1), seconds: 1700000000 }], "next"))
      : envelope(collectionResponse([{ uri: uri(2), seconds: 1700000010 }], ""));
  });
  const result = await f.client.likedCollection("self", {}, () => {});
  assert.deepEqual(result.tracks.map(row => row.uri), [uri(1), uri(2)]);
  assert.deepEqual(result.tracks.map(row => row.addedAt), [1700000000000, 1700000010000]);
  assert.deepEqual(f.calls, [
    { operation: "liked.capabilities", args: undefined },
    { operation: "liked.read", args: { kind: "collection", username: "self", cursor: "", limit: 100 } },
    { operation: "liked.read", args: { kind: "collection", username: "self", cursor: "next", limit: 100 } },
  ]);
});

test("actual factory forwards native HTTP status and DataClient refuses same-request HTTP downgrade", async t => {
  const f = fixture(t, async () => ({ status: 403 }));
  await assert.rejects(f.client.likedContext("self", {}, () => {}), error => error.status === 403);
  assert.deepEqual(f.calls.map(call => call.operation), ["liked.capabilities", "liked.read"]);
});

test("native authentication errors through actual factory remain redacted and never read session tokens", async t => {
  const privateValue = "native-private-client-credential";
  const f = fixture(t, async () => { throw new Error(`SP_LIKED_CLIENT_TOKEN ${privateValue}`); });
  await assert.rejects(f.client.likedContext("self", {}, () => {}), error => {
    assert.match(error.message, /authentication.*not ready/i);
    assert.equal(error.message.includes(privateValue), false);
    return true;
  });
  assert.deepEqual(f.calls.map(call => call.operation), ["liked.capabilities", "liked.read"]);
});


test("automatic native account identity bypasses profile HTTP through the actual SDK facade", async t => {
  const f = fixture(t, async () => jsonEnvelope({ uri: "spotify:user:self:collection", pages: [{ tracks: [track(1)] }] }));
  assert.equal(typeof f.api.LikedSongs.getAccount, "function");
  const result = await f.client.likedSongs({}, () => {});
  assert.deepEqual(result.tracks.map(row => row.uri), [uri(1)]);
  assert.deepEqual(f.calls.map(call => call.operation), ["liked.account", "liked.capabilities", "liked.read"]);
});
