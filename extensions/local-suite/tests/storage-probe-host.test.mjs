import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = await fs.realpath(path.join(root, "node_modules/spotifyplus"));
process.env.NODE_PATH = path.join(sdk, "node_modules");
Module._initPaths();
const host = path.resolve(sdk, "../nodejs");
const { ScriptLoader } = await import(pathToFileURL(path.join(host, "loader/script-loader.js")));
const { ScriptRegistry } = await import(pathToFileURL(path.join(host, "loader/script-registry.js")));
const { Bridge } = await import(pathToFileURL(path.join(host, "bridge/bridge.js")));
const id = "com.wamako.ci.storageprobe";
const written = "SPOTIFYPLUS_CI_STORAGE_WRITE_OK";
const reloaded = "SPOTIFYPLUS_CI_STORAGE_RELOAD_OK";

// Real pinned loader, API factory and JSON/binary bridge; only Android's native
// addon is substituted. Each load gets fresh runtime/registry/bridge objects.
function fixture({ dropWrites = false, ignoreRemovals = false } = {}) {
  const prefs = new Map(), files = new Map(), writes = [];
  function key(script, name) {
    assert.ok([id, `spotifyplus-cache:${id}`].includes(script), "fixture escaped its namespace");
    return `${script}:${name}`;
  }
  function write(map, script, name, value) {
    writes.push(name);
    if (!dropWrites) map.set(key(script, name), structuredClone(value));
  }
  const addon = {
    storageSet: (script, name, value) => write(prefs, script, name, value),
    storageGet: (script, name) => prefs.get(key(script, name)),
    storageRemove(script, name) {
      if (ignoreRemovals) return;
      if (script.startsWith("spotifyplus-delete:")) {
        files.delete(key(script.slice("spotifyplus-delete:".length), name));
      } else prefs.delete(key(script, name));
    },
    storageWriteText: (script, name, value) => write(files, script, name, { type: "text", value }),
    storageWriteJson: (script, name, value) => write(files, script, name, { type: "json", value }),
    storageWriteBinary: (script, name, data) => write(files, script, name, { type: "binary", data }),
    storageRead: (script, name) => structuredClone(files.get(key(script, name))),
  };
  function load() {
    const messages = [];
    const logger = { child() { return this; }, info() {}, warn() {}, error() {} };
    const registry = new ScriptRegistry(logger, () => {});
    // Avoid constructing/loading a native addon; execute Bridge's real methods.
    const bridge = Object.create(Bridge.prototype);
    bridge.addon = addon;
    const forbidden = () => { throw new Error("Unexpected service or account access"); };
    const runtime = {
      registry, ui: { forExtension() { return {}; } }, platformData: {}, session: {},
      createWorkletContext() { return true; }, createAnimationAdapter() { return {}; },
      disposeWorkletContext() {}, unregisterScript: script => registry.unregisterScript(script),
      logScript(script, level, args) { assert.equal(script, id); assert.equal(level, "log"); messages.push(...args); },
      callApiSync: forbidden, requestApi: forbidden, getTrack: forbidden,
    };
    for (const method of ["storageSet", "storageGet", "storageRemove", "storageWriteText",
      "storageWriteJson", "storageWriteBinary", "storageRead", "storageDelete",
      "cacheWriteText", "cacheWriteJson", "cacheWriteBinary", "cacheRead", "cacheDelete"]) {
      runtime[method] = bridge[method].bind(bridge);
    }
    const originalFetch = globalThis.fetch;
    globalThis.fetch = forbidden;
    try {
      new ScriptLoader(runtime, logger).loadScript(path.join(root, "build/SpotifyPlus-CI-Storage-Probe/storage-probe"), "user");
      assert.equal(registry.getScripts().length, 1);
      return messages;
    } finally {
      for (const script of [...registry.getScripts()]) runtime.unregisterScript(script.manifest.id);
      globalThis.fetch = originalFetch;
      assert.equal(registry.getScripts().length, 0);
    }
  }
  return { load, prefs, files, writes };
}

test("CI probe verifies typed values/files with real loader and bridge across fresh runtimes, then cleans up", () => {
  const f = fixture();
  assert.deepEqual(f.load(), [written]);
  assert.equal(JSON.parse(f.prefs.get(`${id}:probe-boolean`)), false);
  assert.equal(f.files.get(`${id}:probe/data.bin`).data, "AAF/gP8=");
  assert.deepEqual(f.load(), [reloaded]);
  assert.equal(f.prefs.size, 0);
  assert.equal(f.files.size, 0);
});

test("silently dropped writes and ignored removals never produce a successful probe marker", () => {
  for (const fault of [{ dropWrites: true }, { ignoreRemovals: true }]) {
    assert.throws(() => fixture(fault).load(), /SP_CI_STORAGE_ASSERT/);
  }
});

test("reload checks lost/corrupt preferences and files before attempting any write", () => {
  for (const corrupt of [
    f => f.prefs.delete(`${id}:probe-text`),
    f => f.prefs.set(`${id}:probe-boolean`, "true"),
    f => f.files.delete(`${id}:probe/data.json`),
    f => f.files.delete(`spotifyplus-cache:${id}:probe/cache.txt`),
  ]) {
    const f = fixture();
    assert.deepEqual(f.load(), [written]);
    corrupt(f);
    f.writes.length = 0;
    assert.throws(() => f.load(), /SP_CI_STORAGE_ASSERT/);
    assert.deepEqual(f.writes, []);
  }
});

test("a total storage reset can only emit the first-launch marker, never persisted reload evidence", () => {
  const f = fixture();
  assert.deepEqual(f.load(), [written]);
  f.prefs.clear(); f.files.clear();
  assert.deepEqual(f.load(), [written]);
});
