import test from "node:test";
import assert from "node:assert/strict";
import { DataClient } from "../shared/data.mjs";

const JOURNAL = "last-write-v1";
const PRIVATE_ERROR = "private storage detail /data/account-secret";
const copyUri = `spotify:playlist:${"9".repeat(22)}`;
const tracks = count => Array.from({ length: count }, (_, i) => ({
  uri: `spotify:track:${String(i + 1).padStart(22, "0")}`,
}));

// Only storage and Spotify's mutation boundary are substituted. Values are
// cloned on both sides to model real serialization rather than object aliases.
function fixture({ save = () => true, read = value => value } = {}) {
  const values = new Map(), native = [], http = [];
  const storage = {
    get(key) {
      const value = structuredClone(values.get(key));
      return key === JOURNAL ? read(value) : value;
    },
    set(key, value) {
      if (key !== JOURNAL || save(structuredClone(value))) {
        values.set(key, structuredClone(value));
      }
    },
  };
  const api = {
    Platform: { Storage: storage, Session: { accessToken: "offline fixture token" } },
    Playlists: {
      async create(name) {
        native.push({ operation: "create", name });
        return { uri: copyUri };
      },
      async addTracks(uri, uris) {
        native.push({ operation: "add", uri, uris: [...uris] });
      },
    },
  };
  const client = new DataClient(api, async (url, options) => {
    assert.equal(options.method, "POST");
    const payload = options.body ? JSON.parse(options.body) : undefined;
    http.push({ url, payload });
    return url.endsWith("/me/playlists") ? { uri: copyUri } : null;
  });
  function run(operation, count = operation === "appendQueue" ? 3 : 201) {
    const input = tracks(count);
    return operation === "appendQueue"
      ? client.appendQueue(input, "confirm", "confirm", {})
      : client[operation](input, "Review copy", "confirm", "confirm", {});
  }
  return { run, values, native, http };
}

for (const operation of ["nativeCopy", "createCopy", "appendQueue"]) {
  test(`${operation}: a silently dropped initial journal prevents every mutation`, async () => {
    const f = fixture({ save: () => false });
    await assert.rejects(f.run(operation));
    assert.deepEqual(f.native, []);
    assert.deepEqual(f.http, []);
  });

  test(`${operation}: an unreadable initial journal prevents every mutation without exposing storage details`, async () => {
    const f = fixture({ read() { throw new Error(PRIVATE_ERROR); } });
    await assert.rejects(f.run(operation), error => !error.message.includes(PRIVATE_ERROR));
    assert.deepEqual(f.native, []);
    assert.deepEqual(f.http, []);
  });

  test(`${operation}: a stale prior journal cannot satisfy the initial save`, async () => {
    const f = fixture({ read: () => ({
      action: operation === "nativeCopy" ? "native-copy" : operation === "createCopy" ? "copy" : "queue-append",
      startedAt: 1, requested: operation === "appendQueue" ? 3 : 201,
      completed: 0, uri: "", phase: "complete",
    }) });
    await assert.rejects(f.run(operation));
    assert.deepEqual(f.native, []);
    assert.deepEqual(f.http, []);
  });

  test(`${operation}: a corrupt partial journal cannot satisfy the initial save`, async () => {
    const f = fixture({ read: () => ({ phase: "creating" }) });
    await assert.rejects(f.run(operation));
    assert.deepEqual(f.native, []);
    assert.deepEqual(f.http, []);
  });
}

for (const operation of ["nativeCopy", "createCopy"]) {
  test(`${operation}: losing the created-copy checkpoint stops before adding and retains its URI`, async () => {
    const f = fixture({ save: value => !value.uri });
    await assert.rejects(f.run(operation), error =>
      error.message.includes(copyUri) && /\b0\/201\b/.test(error.message));
    assert.equal(f.native.length + f.http.length, 1);
    assert.equal(operation === "nativeCopy" ? f.http.length : f.native.length, 0);
  });

  test(`${operation}: a throwing created-copy checkpoint preserves the known result and redacts the cause`, async () => {
    const f = fixture({ save(value) {
      if (value.uri) throw new Error(PRIVATE_ERROR);
      return true;
    } });
    await assert.rejects(f.run(operation), error =>
      error.message.includes(copyUri) && /\b0\/201\b/.test(error.message) &&
      !error.message.includes(PRIVATE_ERROR));
    assert.equal(f.native.length + f.http.length, 1);
    assert.equal(operation === "nativeCopy" ? f.http.length : f.native.length, 0);
  });

  test(`${operation}: a dropped acknowledged-batch checkpoint stops before the next batch without retries`, async () => {
    const f = fixture({ save: value => value.completed < 100 });
    await assert.rejects(f.run(operation), error =>
      error.message.includes(copyUri) && /\b100\/201\b/.test(error.message));
    assert.equal(f.native.length + f.http.length, 2);
    assert.equal(operation === "nativeCopy" ? f.http.length : f.native.length, 0);
    const batches = operation === "nativeCopy" ? f.native.slice(1).map(call => call.uris) : f.http.slice(1).map(call => call.payload.uris);
    assert.deepEqual(batches, [tracks(100).map(track => track.uri)]);
  });

  test(`${operation}: stale progress read-back cannot authorize the next batch`, async () => {
    const f = fixture({ read: value => value?.completed >= 100 ? { ...value, completed: 0 } : value });
    await assert.rejects(f.run(operation), error =>
      error.message.includes(copyUri) && /\b100\/201\b/.test(error.message));
    assert.equal(f.native.length + f.http.length, 2);
    assert.equal(operation === "nativeCopy" ? f.http.length : f.native.length, 0);
  });

  test(`${operation}: a dropped final checkpoint reports acknowledged counts rather than success`, async () => {
    const f = fixture({ save: value => value.phase !== "complete" });
    await assert.rejects(f.run(operation, 3), error =>
      error.message.includes(copyUri) && /\b3\/3\b/.test(error.message));
    assert.equal(f.native.length + f.http.length, 2);
    assert.equal(operation === "nativeCopy" ? f.http.length : f.native.length, 0);
  });
}

test("appendQueue: a dropped acknowledged-item checkpoint stops before appending another item", async () => {
  const f = fixture({ save: value => value.completed < 1 });
  await assert.rejects(f.run("appendQueue"), error => /\b1\/3\b/.test(error.message));
  assert.deepEqual(f.native, []);
  assert.equal(f.http.length, 1);
  assert.equal(decodeURIComponent(f.http[0].url).split("?uri=")[1], tracks(1)[0].uri);
});

test("appendQueue: a throwing checkpoint retains the acknowledged count and redacts its cause", async () => {
  const f = fixture({ save(value) {
    if (value.completed >= 1) throw new Error(PRIVATE_ERROR);
    return true;
  } });
  await assert.rejects(f.run("appendQueue"), error =>
    /\b1\/3\b/.test(error.message) && !error.message.includes(PRIVATE_ERROR));
  assert.deepEqual(f.native, []);
  assert.equal(f.http.length, 1);
});

test("appendQueue: stale progress read-back cannot authorize another queue append", async () => {
  const f = fixture({ read: value => value?.completed >= 1 ? { ...value, completed: 0 } : value });
  await assert.rejects(f.run("appendQueue"), error => /\b1\/3\b/.test(error.message));
  assert.deepEqual(f.native, []);
  assert.equal(f.http.length, 1);
});

test("appendQueue: a dropped final checkpoint reports the known count instead of success", async () => {
  const f = fixture({ save: value => value.phase !== "complete" });
  await assert.rejects(f.run("appendQueue", 1), error => /\b1\/1\b/.test(error.message));
  assert.deepEqual(f.native, []);
  assert.equal(f.http.length, 1);
});

test("healthy journals allow each operation to finish with the acknowledged counts", async () => {
  for (const operation of ["nativeCopy", "createCopy", "appendQueue"]) {
    const f = fixture();
    const result = await f.run(operation, 3);
    assert.equal(result.completed, 3);
    assert.equal(result.phase, "complete");
    assert.equal(f.values.get(JOURNAL).completed, 3);
    assert.equal(f.values.get(JOURNAL).phase, "complete");
  }
});
