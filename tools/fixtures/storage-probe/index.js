// CI-only user extension. Installed exclusively on a fresh disposable AVD.
// Never access a Spotify session, service, queue, or another extension's data.
import { SpotifyPlus as S } from "spotifyplus";

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
  storage.set("probe-phase", "await-reload");
  equal(storage.get("probe-phase"), "await-reload");
  console.log("SPOTIFYPLUS_CI_STORAGE_WRITE_OK");
} else if (phase === "await-reload") {
  // Verify persisted values BEFORE any write; missing data must never be repaired.
  checkValues();
  equal(storage.get("probe-removed"), null);
  equal(storage.read("probe/removed.txt"), null);
  equal(storage.Cache.read("probe/removed.txt"), null);
  for (const key of Object.keys(preferences)) storage.remove(key);
  for (const file of ["probe/text.txt", "probe/data.json", "probe/data.bin"]) {
    storage.delete(file);
    equal(storage.read(file), null);
  }
  storage.Cache.delete("probe/cache.txt");
  equal(storage.Cache.read("probe/cache.txt"), null);
  storage.remove("probe-phase");
  for (const key of [...Object.keys(preferences), "probe-phase"]) equal(storage.get(key), null);
  console.log("SPOTIFYPLUS_CI_STORAGE_RELOAD_OK");
} else {
  throw new Error("SP_CI_STORAGE_PHASE");
}
