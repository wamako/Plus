import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = path.resolve(process.env.SPOTIFYPLUS_SDK_SOURCE || path.join(root, "node_modules/spotifyplus"));
const { bundleExtension } = await import(pathToFileURL(path.join(sdk, "tools/extension-build.mjs")));
const out = path.join(root, "build/SpotifyPlus-ShufflePlus/shuffle-plus");
const manifest = { id: "com.wamako.shuffleplus", name: "Shuffle+", author: "wamako", version: "0.1.2", api: 2,
  main: "index.js", description: "Independent Android Shuffle+ adaptation. Requires Spotify Plus R14 for Spotify 9.1.94.1929." };
await fs.mkdir(out, { recursive: true });
await bundleExtension({ scriptDir: path.join(root, "apps/shuffle-plus"), manifest,
  entryPath: path.join(root, "apps/shuffle-plus/index.tsx"), outfile: path.join(out, "index.js"), target: "es2020", minify: false });
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await fs.copyFile(path.join(root, "SHUFFLE_PLUS.md"), path.join(out, "README.md"));
await fs.copyFile(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
console.log("Built separate Shuffle+ 0.1.2 bundle (existing 0.1.7 suite stays separate)");
