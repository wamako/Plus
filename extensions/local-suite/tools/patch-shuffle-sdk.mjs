// One additive API in the pinned SDK; used by both host and extension builds.
import fs from "node:fs";
import path from "node:path";
const file = path.join(process.argv[2], "loader/script-api.ts");
let source = fs.readFileSync(file, "utf8");
if (!source.includes("    ShufflePlus: {")) {
  const declaration = "    Queue: QueueApi;";
  const factory = "            Queue: {";
  if (!source.includes(declaration) || !source.includes(factory)) throw new Error("Pinned SDK API shape changed");
  source = source.replace(declaration, `${declaration}
    /** R13 native Shuffle+ adapter. These use requestApi, not legacy request messages. */
    ShufflePlus: {
        capabilities(): Promise<unknown>;
        diagnostics(): Promise<unknown>;
        copyDiagnostics(): Promise<boolean>;
        previewQueue(): Promise<unknown>;
        prepare(context: string, uris: string[]): Promise<unknown>;
        apply(ticket: string, order: number[]): Promise<unknown>;
    };`);
  source = source.replace(factory, `            ShufflePlus: {
                capabilities: () => runtime.requestApi('shuffleplus.capabilities'),
                diagnostics: () => runtime.requestApi('shuffleplus.diagnostics'),
                copyDiagnostics: () => runtime.requestApi('shuffleplus.copyDiagnostics'),
                previewQueue: () => runtime.requestApi('shuffleplus.queue'),
                prepare: (context, uris) => runtime.requestApi('shuffleplus.prepare', { context, uris }),
                apply: (ticket, order) => runtime.requestApi('shuffleplus.apply', { ticket, order }),
            },
${factory}`);
  fs.writeFileSync(file, source);
}
// Navigation is synchronous acceptance. Unmount the extension overlay only
// when Android accepted the link, otherwise keep the page available to retry.
const before = "openSpotify: uri => this.runtime.navigate(uri, 'spotify'),";
const after = `openSpotify: uri => {
                    const opened = this.runtime.navigate(uri, 'spotify');
                    if (opened) this.runtime.closeSurface(scriptId);
                    return opened;
                },`;
if (source.includes(before)) {
  source = source.replace(before, after);
  fs.writeFileSync(file, source);
} else if (!source.includes(after)) throw new Error("Pinned SDK navigation shape changed");

source = fs.readFileSync(file, "utf8");
if (!source.includes("        diagnostics(): Promise<unknown>;")) {
  source = source.replace("        capabilities(): Promise<unknown>;", "        capabilities(): Promise<unknown>;\n        diagnostics(): Promise<unknown>;\n        copyDiagnostics(): Promise<boolean>;");
  source = source.replace("                capabilities: () => runtime.requestApi('shuffleplus.capabilities'),", "                capabilities: () => runtime.requestApi('shuffleplus.capabilities'),\n                diagnostics: () => runtime.requestApi('shuffleplus.diagnostics'),\n                copyDiagnostics: () => runtime.requestApi('shuffleplus.copyDiagnostics'),");
  fs.writeFileSync(file, source);
}

// Keep Spotify's client credential in Java; extensions receive read data only.
source = fs.readFileSync(file, "utf8");
if (!source.includes("    LikedSongs: {")) {
  const declaration = "    Queue: QueueApi;", factory = "            Queue: {";
  if (!source.includes(declaration) || !source.includes(factory)) throw new Error("Pinned SDK Liked Songs API shape changed");
  source = source.replace(declaration, `${declaration}
    LikedSongs: {
        capabilities(): Promise<unknown>;
        read(args: { kind: 'context'; url: string } | { kind: 'collection'; username: string; cursor: string; limit: number }): Promise<unknown>;
    };`);
  source = source.replace(factory, `            LikedSongs: {
                capabilities: () => runtime.requestApi('liked.capabilities'),
                read: args => runtime.requestApi('liked.read', args),
            },
${factory}`);
  fs.writeFileSync(file, source);
}
