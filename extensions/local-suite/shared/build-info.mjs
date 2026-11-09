// Bundled into the extension; no runtime file access or JSON module loader needed.
import versions from "../../../build-versions.json" with { type: "json" };
export const HOST = versions.host;
export default versions;
