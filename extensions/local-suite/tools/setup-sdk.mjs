// Downloads and builds the exact API-2 runtime SDK embedded by the R10 module.
// Build-time tooling only; no SDK archive or Node dependencies are needed on the phone.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const pin = "615455bf0a7a81cd2d01382a1f1e9e0a699fb082";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "spotifyplus-sdk-"));
const archive = path.join(temp, "sdk.tar.gz");
// curl honors the build machine's proxy and CA configuration.
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}).`);
}
run("curl", [
  "--fail",
  "--location",
  "--proto",
  "=https",
  "--proto-redir",
  "=https",
  `https://gitlab.com/LeNerd46/spotify-plus/-/archive/${pin}/spotify-plus-${pin}.tar.gz`,
  "--output",
  archive,
]);
const selected = `spotify-plus-${pin}/app/src/main/assets/nodejs-src`;
run("tar", ["-xzf", archive, "-C", temp, selected]);
const destination = path.join(root, ".sdk");
await fs.rm(destination, { recursive: true, force: true });
await fs.rename(path.join(temp, selected), destination);
run("npm", ["ci", "--ignore-scripts"], destination);
run("npm", ["run", "build"], destination);
// The emitted host is CommonJS even when the surrounding extension workspace is ESM.
await fs.writeFile(
  path.join(root, "nodejs/package.json"),
  JSON.stringify({ private: true, type: "commonjs" }) + "\n",
);
// Runtime build emits beside nodejs-src, including the matching React dependencies.
await fs.rm(path.join(root, "node_modules/spotifyplus"), {
  recursive: true,
  force: true,
});
await fs.symlink(
  destination,
  path.join(root, "node_modules/spotifyplus"),
  "dir",
);
await fs.rm(path.join(root, "node_modules/react"), {
  recursive: true,
  force: true,
});
await fs.symlink(
  path.join(root, "nodejs/node_modules/react"),
  path.join(root, "node_modules/react"),
  "dir",
);
await fs.rm(temp, { recursive: true, force: true });
console.log(`Pinned SDK ready: ${pin}`);
