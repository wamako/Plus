// CI-only user extension. Installed exclusively on a fresh disposable AVD.
// Never access a Spotify session, service, queue, or another extension's data.
import { SpotifyPlus as S } from "spotifyplus";
import { beginJournal, checkpointJournal } from "../../../extensions/local-suite/shared/write-journal.mjs";
import { smartShuffle } from "../../../extensions/local-suite/shared/model.mjs";

if (S.version !== 2) throw new Error("SP_CI_API_VERSION");
console.log("SPOTIFYPLUS_CI_API2_OK");

const storage = S.Platform.Storage;
const preferences = {
  "probe-text": "CI storage: café 🎵",
  "probe-object": { enabled: true, count: 13, values: [false, "text", 0] },
  "probe-boolean": false,
};
const text = "CI private file: café 🎵";
const object = { version: 1, values: ["CI", false, 13] };
const binary = new Uint8Array([0, 1, 127, 128, 255]);

function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    // A fixed category only: don't log stored values or native error messages.
    throw new Error("SP_CI_STORAGE_ASSERT");
  }
}

function checkValues() {
  for (const [key, value] of Object.entries(preferences)) equal(storage.get(key), value);
  equal(storage.read("probe/text.txt"), text);
  equal(storage.read("probe/data.json"), object);
  equal(Array.from(storage.read("probe/data.bin") || []), Array.from(binary));
  equal(storage.Cache.read("probe/cache.txt"), "CI cache");
}

function checkFeatures(reload) {
  if (reload) {
    const saved = storage.get("last-write-v1");
    equal(saved?.action, "ci-fixture");
    equal(saved?.phase, "complete");
    equal(saved?.completed, 2);
    equal(typeof saved?.operationId, "string");
  }
  const journal = beginJournal(storage, {
    action: "ci-fixture", phase: "creating", requested: 2, completed: 0,
  });
  // Storage really crosses the native JSON bridge. Only the mutation boundary
  // is simulated; this fixture never changes a playlist or queue.
  let mutations = 0;
  const dropped = { set() {}, get: key => storage.get(key) };
  let rejected = false;
  try {
    beginJournal(dropped, { action: "ci-fixture", phase: "creating", requested: 2, completed: 0 });
    mutations++;
  } catch { rejected = true; }
  equal(rejected, true);
  equal(mutations, 0);
  rejected = false;
  try {
    checkpointJournal(dropped, { ...journal, completed: 1 });
    mutations++;
  } catch { rejected = true; }
  equal(rejected, true);
  equal(mutations, 0);
  checkpointJournal(storage, { ...journal, phase: "complete", completed: 2 });
  console.log("SPOTIFYPLUS_CI_JOURNAL_OK");

  const count = 100000;
  let reads = 0;
  const tracks = Array.from({ length: count }, (_, occurrence) => ({
    occurrence,
    get artist() {
      if (++reads > count * 3) throw new Error("SP_CI_STORAGE_ASSERT");
      return "CI artist";
    },
  }));
  const shuffled = smartShuffle(tracks, () => 0.5);
  equal(shuffled.length, count);
  equal(new Set(shuffled).size, count);
  equal(tracks[0].occurrence, 0);
  console.log("SPOTIFYPLUS_CI_ARTIST_SHUFFLE_OK");
}

const phase = storage.get("probe-phase");
if (phase === null) {
  for (const key of Object.keys(preferences)) equal(storage.get(key), null);
  for (const file of ["probe/text.txt", "probe/data.json", "probe/data.bin"]) {
    equal(storage.read(file), null);
  }
  equal(storage.Cache.read("probe/cache.txt"), null);
  for (const [key, value] of Object.entries(preferences)) storage.set(key, value);
  storage.write("probe/text.txt", text);
  storage.write("probe/data.json", object);
  storage.write("probe/data.bin", binary);
  storage.Cache.write("probe/cache.txt", "CI cache");
  checkValues();
  storage.set("probe-removed", true);
  storage.remove("probe-removed");
  equal(storage.get("probe-removed"), null);
  storage.write("probe/removed.txt", "CI temporary");
  storage.delete("probe/removed.txt");
  equal(storage.read("probe/removed.txt"), null);
  storage.Cache.write("probe/removed.txt", "CI temporary");
  storage.Cache.delete("probe/removed.txt");
  equal(storage.Cache.read("probe/removed.txt"), null);
  checkFeatures(false);
  storage.set("probe-phase", "await-reload");
  equal(storage.get("probe-phase"), "await-reload");
  console.log("SPOTIFYPLUS_CI_STORAGE_WRITE_OK");
} else if (phase === "await-reload") {
  // Verify persisted values BEFORE any write; missing data must never be repaired.
  checkValues();
  equal(storage.get("probe-removed"), null);
  equal(storage.read("probe/removed.txt"), null);
  equal(storage.Cache.read("probe/removed.txt"), null);
  checkFeatures(true);
  for (const key of Object.keys(preferences)) storage.remove(key);
  for (const file of ["probe/text.txt", "probe/data.json", "probe/data.bin"]) {
    storage.delete(file);
    equal(storage.read(file), null);
  }
  storage.Cache.delete("probe/cache.txt");
  equal(storage.Cache.read("probe/cache.txt"), null);
  storage.remove("probe-phase");
  storage.remove("last-write-v1");
  for (const key of [...Object.keys(preferences), "probe-phase", "last-write-v1"]) equal(storage.get(key), null);
  console.log("SPOTIFYPLUS_CI_STORAGE_RELOAD_OK");
} else {
  throw new Error("SP_CI_STORAGE_PHASE");
}
