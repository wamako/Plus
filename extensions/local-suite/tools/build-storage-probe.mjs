// Separate CI artifact: never included in a phone extension/module deliverable.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = path.resolve(process.env.SPOTIFYPLUS_SDK_SOURCE || path.join(root, "node_modules/spotifyplus"));
const { bundleExtension } = await import(pathToFileURL(path.join(sdk, "tools/extension-build.mjs")));
const scriptDir = path.resolve(root, "../../tools/fixtures/storage-probe");
const out = path.join(root, "build/SpotifyPlus-CI-Storage-Probe/storage-probe");
const manifest = {
  id: "com.wamako.ci.storageprobe", name: "CI storage probe", author: "wamako",
  version: "1.0.0", api: 2, main: "index.js",
  description: "Disposable AVD storage validation fixture. Do not install on a phone.",
};
await fs.mkdir(out, { recursive: true });
await bundleExtension({ scriptDir, manifest, entryPath: path.join(scriptDir, "index.js"),
  outfile: path.join(out, "index.js"), target: "es2020", minify: false });
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Built CI-only storage probe");
