import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import versions from "../shared/build-info.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = path.resolve(process.env.SPOTIFYPLUS_SDK_SOURCE || path.join(root, "node_modules/spotifyplus"));
const { bundleExtension } = await import(pathToFileURL(path.join(sdk, "tools/extension-build.mjs")));
const out = path.join(root, "build/SpotifyPlus-ShufflePlus/shuffle-plus");
const manifest = { id: "com.wamako.shuffleplus", name: "Shuffle+", author: "wamako", version: versions.shuffleVersion, api: 2,
  main: "index.js", description: `Independent Android Shuffle+ adaptation. Requires Spotify Plus R${versions.host} for Spotify ${versions.spotifyVersion}.` };
await fs.mkdir(out, { recursive: true });
await bundleExtension({ scriptDir: path.join(root, "apps/shuffle-plus"), manifest,
  entryPath: path.join(root, "apps/shuffle-plus/index.tsx"), outfile: path.join(out, "index.js"), target: "es2020", minify: false });
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await fs.copyFile(path.join(root, "SHUFFLE_PLUS.md"), path.join(out, "README.md"));
await fs.copyFile(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
console.log(`Built separate Shuffle+ ${versions.shuffleVersion} bundle (suite ${versions.suiteVersion} stays separate)`);
