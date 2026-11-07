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
        previewQueue(): Promise<unknown>;
        prepare(context: string, uris: string[]): Promise<unknown>;
        apply(ticket: string, order: number[]): Promise<unknown>;
    };`);
  source = source.replace(factory, `            ShufflePlus: {
                capabilities: () => runtime.requestApi('shuffleplus.capabilities'),
                previewQueue: () => runtime.requestApi('shuffleplus.queue'),
                prepare: (context, uris) => runtime.requestApi('shuffleplus.prepare', { context, uris }),
                apply: (ticket, order) => runtime.requestApi('shuffleplus.apply', { ticket, order }),
            },
${factory}`);
  fs.writeFileSync(file, source);
}
