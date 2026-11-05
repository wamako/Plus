// Read-only collection-v2 protocol fields, grounded in collection2v2.proto.
export const LIKED_URI = "spotify:collection:tracks";
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
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
  const bytes = encoder.encode(text);
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
    let value = 0,
      multiplier = 1;
    for (let i = 0; i < 10; i++) {
      if (offset >= bytes.length)
        throw new Error("Truncated collection response.");
      const byte = bytes[offset++];
      value += (byte & 127) * multiplier;
      if (!Number.isSafeInteger(value))
        throw new Error("Collection integer exceeds safe range.");
      if (!(byte & 128)) return value;
      multiplier *= 128;
    }
    throw new Error("Invalid collection varint.");
  }
  while (offset < bytes.length) {
    const tag = read(),
      number = Math.floor(tag / 8),
      wire = tag % 8;
    if (!number) throw new Error("Invalid collection field.");
    if (wire === 0) result.push({ number, value: read() });
    else if (wire === 2) {
      const length = read();
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
  return decoder.decode(field.value);
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
          if (typeof f.value !== "number")
            throw new Error("Invalid saved timestamp.");
          item.addedAt = f.value * 1000;
        }
        if (f.number === 3) {
          if (typeof f.value !== "number")
            throw new Error("Invalid removal flag.");
          item.removed = f.value !== 0;
        }
      }
      if (!item.uri) throw new Error("Collection item omitted its URI.");
      out.items.push(item);
    } else if (field.number === 2) out.next = text(field);
    else if (field.number === 3) out.sync = text(field);
  }
  if (!out.sync) throw new Error("Collection response omitted the sync token.");
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
