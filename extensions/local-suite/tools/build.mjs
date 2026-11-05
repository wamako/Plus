import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = path.resolve(
  process.env.SPOTIFYPLUS_SDK_SOURCE ||
    path.join(root, "node_modules/spotifyplus"),
);
const { bundleExtension } = await import(
  pathToFileURL(path.join(sdk, "tools/extension-build.mjs"))
);
const apps = [
  ["listening-stats", "com.wamako.listeningstats", "Listening Stats"],
  ["sort-play", "com.wamako.sortplay", "Sort Play"],
  ["genres", "com.wamako.genres", "What’s That Genre?"],
  ["playlist-plus", "com.wamako.playlistplus", "Playlist Plus"],
];
for (const [folder, id, name] of apps) {
  const source = path.join(root, "apps", folder),
    out = path.join(root, "build", "SpotifyPlus-Local-Extensions", folder);
  const manifest = {
    id,
    name,
    author: "wamako",
    version: "0.1.5",
    api: 2,
    main: "index.js",
    description: `Independent Android adaptation: ${name}. For Spotify Plus R10 API 2.`,
  };
  await fs.mkdir(out, { recursive: true });
  await bundleExtension({
    scriptDir: source,
    manifest,
    entryPath: path.join(source, "index.tsx"),
    outfile: path.join(out, "index.js"),
    target: "es2020",
    minify: false,
  });
  await fs.writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `${folder}: ${(await fs.stat(path.join(out, "index.js"))).size} bytes`,
  );
}
for (const name of [
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "VALIDATION.md",
])
  await fs.copyFile(
    path.join(root, name),
    path.join(root, "build", "SpotifyPlus-Local-Extensions", name),
  );
