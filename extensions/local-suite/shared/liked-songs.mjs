// Read-only collection-v2 protocol fields, grounded in collection2v2.proto.
export const LIKED_URI = "spotify:collection:tracks";
export const MAX_LIKED_ITEMS = 100000;
export const MAX_LIKED_PAGES = 10000;
// The R10 host provides Node's Buffer. Avoid eager optional text-codec
// constructors: Node 18 builds without ICU reject TextDecoder's fatal option.
export function validUsername(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\s:/?#\x00-\x1f]/.test(value)
  );
}
export function likedInput(input) {
  let value = String(input ?? "").trim();
  if (value.startsWith("https://open.spotify.com/")) {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    value = url.pathname.replace(/^\/intl-[^/]+\//, "/").replace(/\/$/, "");
    if (value === "/collection/tracks") return { uri: LIKED_URI, username: "" };
    return null;
  }
  if (value === LIKED_URI || value === "spotify:collection")
    return { uri: LIKED_URI, username: "" };
  const match = /^spotify:user:([^:]+):collection(?::tracks)?$/.exec(value);
  if (!match) return null;
  let username;
  try {
    username = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!validUsername(username)) return null;
  return { uri: LIKED_URI, username };
}
function varint(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid collection integer.");
  const bytes = [];
  do {
    let b = value % 128;
    value = Math.floor(value / 128);
    bytes.push(value ? b + 128 : b);
  } while (value);
  return bytes;
}
function stringField(number, text) {
  const bytes = Buffer.from(text, "utf8");
  return [...varint(number * 8 + 2), ...varint(bytes.length), ...bytes];
}
export function encodeCollectionPage(username, token = "", limit = 100) {
  if (
    !validUsername(username) ||
    typeof token !== "string" ||
    token.length > 16384 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error("Invalid collection page request.");
  return Uint8Array.from([
    ...stringField(1, username),
    ...stringField(2, "collection"),
    ...stringField(3, token),
    32,
    ...varint(limit),
  ]);
}
function fields(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > 4 * 1024 * 1024)
    throw new Error("Collection page exceeds the size limit.");
  let offset = 0;
  const result = [];
  function read() {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (offset >= bytes.length)
        throw new Error("Truncated collection response.");
      const byte = bytes[offset++];
      if (i === 9 && byte > 1) throw new Error("Invalid collection varint.");
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return value;
    }
    throw new Error("Invalid collection varint.");
  }
  while (offset < bytes.length) {
    const rawTag = read();
    if (rawTag > 0xffffffffn) throw new Error("Invalid collection field.");
    const tag = Number(rawTag),
      number = Math.floor(tag / 8),
      wire = tag % 8;
    if (!number) throw new Error("Invalid collection field.");
    if (wire === 0) result.push({ number, value: read() });
    else if (wire === 2) {
      const rawLength = read();
      if (rawLength > BigInt(bytes.length - offset))
        throw new Error("Truncated collection field.");
      const length = Number(rawLength);
      if (length > bytes.length - offset)
        throw new Error("Truncated collection field.");
      result.push({ number, value: bytes.subarray(offset, offset + length) });
      offset += length;
    } else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > bytes.length) throw new Error("Truncated collection field.");
    } else throw new Error("Unsupported collection wire type.");
  }
  return result;
}
const text = (field) => {
  if (!(field.value instanceof Uint8Array))
    throw new Error("Invalid collection text.");
  const bytes = Buffer.from(field.value);
  const decoded = bytes.toString("utf8");
  // Buffer replaces malformed sequences. Round-tripping rejects those bytes,
  // while preserving a valid literal U+FFFD and all valid Unicode strings.
  if (!Buffer.from(decoded, "utf8").equals(bytes))
    throw new Error("Invalid collection UTF-8.");
  return decoded;
};
export function decodeCollectionPage(bytes) {
  const out = { items: [], next: "", sync: "" };
  for (const field of fields(bytes)) {
    if (field.number === 1) {
      if (!(field.value instanceof Uint8Array))
        throw new Error("Invalid collection item.");
      const item = { uri: "", addedAt: null, removed: false };
      for (const f of fields(field.value)) {
        if (f.number === 1) item.uri = text(f);
        if (f.number === 2) {
          if (typeof f.value !== "bigint")
            throw new Error("Invalid saved timestamp.");
          const seconds = Number(BigInt.asIntN(32, f.value));
          item.addedAt = seconds > 0 ? seconds * 1000 : null;
        }
        if (f.number === 3) {
          if (typeof f.value !== "bigint")
            throw new Error("Invalid removal flag.");
          item.removed = f.value !== 0n;
        }
      }
      if (!item.uri) throw new Error("Collection item omitted its URI.");
      out.items.push(item);
    } else if (field.number === 2) out.next = text(field);
    else if (field.number === 3) out.sync = text(field);
  }
  // Sync tokens are optional in proto3. Recognized rows/cursor fields still
  // identify a valid page; an empty/unknown message must not become an empty library.
  if (!out.items.length && !out.next && !out.sync)
    throw new Error("Collection response contained no recognized data.");
  if (out.next.length > 16384 || out.sync.length > 16384)
    throw new Error("Invalid collection cursor.");
  return out;
}
export function contextPageUrl(value) {
  if (typeof value !== "string" || !value || value.length > 16384)
    throw new Error("Invalid context page link.");
  let path = value.startsWith("hm:/") ? value.replace(/^hm:\/+/, "/") : value;
  if (path.startsWith("/") && !path.startsWith("//"))
    path = `https://spclient.wg.spotify.com${path}`;
  const url = new URL(path);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "spclient.wg.spotify.com" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Untrusted context page link.");
  return url.toString();
}
