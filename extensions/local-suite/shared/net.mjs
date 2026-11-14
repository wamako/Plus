export class RequestError extends Error {
  constructor(message, status = 0, unknown = false) {
    super(message);
    this.status = status;
    this.unknown = unknown;
  }
}
// R12 returns only these controlled codes across JNI. Everything else stays
// redacted and conservatively unknown; never display raw native exceptions.
export function nativePlaylistFailure(error) {
  const code = /\bSP_PLAYLIST_(PREPARE(?:_INPUT|_SCHEMA|_CLIENT)?|RPC|ACK|REJECTED_([1-5]\d\d))\b/.exec(String(error?.message || ""));
  if (!code) return null;
  if (code[1].startsWith("PREPARE")) {
    const detail = { PREPARE_INPUT: "invalid copy input", PREPARE_SCHEMA: "playlist protocol unavailable", PREPARE_CLIENT: "native client unavailable; start playback first" }[code[1]] || "request preparation failed";
    return new RequestError(`Native playlist service: ${detail}; nothing was sent for this step (${code[0]}). Check that the R12 module is active.`);
  }
  if (code[1] === "RPC") return new RequestError("Native playlist request failed while waiting for Spotify; this step's outcome is unknown.", 0, true);
  if (code[1] === "ACK") return new RequestError("Native playlist acknowledgment was incomplete; this step's outcome is unknown.", 0, true);
  return new RequestError(`Native playlist service rejected this step (HTTP ${code[2]}).`, Number(code[2]));
}
// Only controlled categories reach diagnostics; URLs, bodies, keys and native
// exception text can contain account data and must never be echoed.
export function failureReason(error) {
  const code = String(error?.code || error?.cause?.code || "");
  const message = String(error?.message || "");
  if (/timeout|timed out/i.test(message) || code === "ETIMEDOUT") return "request timed out";
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "DNS lookup failed";
  if (/CERT|TLS|SSL/.test(code)) return "TLS connection failed";
  if (/ECONN|ENET|EHOST/.test(code)) return "network connection failed";
  if (error?.name === "SyntaxError") return "invalid JSON response";
  if (/fetch|network/i.test(message)) return "network request failed";
  if (/not exposed|not provide|not supported|unsupported|not ready|NoSuchMethod|ClassNotFound|NoSuchField/i.test(message)) return "service not ready or unsupported";
  if (error?.name === "TypeError") return "runtime type error";
  if (error?.name === "ReferenceError") return "runtime dependency unavailable";
  return "provider or host operation failed";
}
export function hostAllowed(url, hosts) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !hosts.includes(parsed.hostname)
  )
    throw new Error("Request host is not allowed.");
  return parsed;
}
export function makeHttp(
  fetcher = globalThis.fetch,
  timer = { set: setTimeout, clear: clearTimeout },
  timeout = 15000,
) {
  const hosts = [
    "api.spotify.com",
    "spclient.wg.spotify.com",
    "ws.audioscrobbler.com",
    "api.stats.fm",
    "lucasoe.github.io",
    "musicbrainz.org",
  ];
  let cooldown = 0;
  return async function request(url, options = {}) {
    const { responseType = "json", readOnly = false, ...init } = options;
    const parsed = hostAllowed(url, hosts),
      method = init.method || "GET";
    const isWrite = method !== "GET" && !readOnly;
    if (
      readOnly &&
      (parsed.hostname !== "spclient.wg.spotify.com" ||
        parsed.pathname !== "/collection/v2/paging" ||
        method !== "POST")
    )
      throw new Error("Invalid read-only POST.");
    if (Date.now() < cooldown)
      throw new RequestError("Provider rate limit: wait before retrying.", 429);
    if (typeof fetcher !== "function")
      throw new Error("This host does not provide fetch.");
    // Native fetch rejects polyfilled AbortSignal instances. The R10 user
    // sandbox may omit AbortController entirely; in that case omit the signal
    // and enforce the caller deadline without pretending to cancel the transport.
    const controller = typeof globalThis.AbortController === "function"
      ? new globalThis.AbortController() : null;
    let handle;
    const work = (async () => {
      const response = await fetcher(parsed.toString(), {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
        redirect: "error",
      });
      if (response.status === 429) {
        const seconds = Math.min(
          300,
          Math.max(1, Number(response.headers?.get?.("retry-after")) || 30),
        );
        cooldown = Date.now() + seconds * 1000;
        throw new RequestError(
          `Provider rate limit. Retry after ${seconds} seconds.`,
          429,
        );
      }
      if (!(response.status >= 200 && response.status < 300))
        throw new RequestError(
          `${parsed.hostname} returned HTTP ${response.status}.`,
          response.status,
          isWrite && response.status >= 500,
        );
      if (response.status === 204) return null;
      if (responseType === "bytes") {
        if (Number(response.headers?.get?.("content-length")) > 4 * 1024 * 1024)
          throw new RequestError("Collection page exceeds the size limit.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 4 * 1024 * 1024)
          throw new RequestError("Collection page exceeds the size limit.");
        return bytes;
      }
      try { return await response.json(); }
      catch { throw new RequestError("Provider returned an invalid JSON response.", 0, isWrite); }
    })();
    try {
      return await Promise.race([
        work,
        new Promise((_, reject) => {
          handle = timer.set(() => {
            controller?.abort();
            reject(
              new RequestError(
                isWrite
                  ? "Request timed out. A write may have completed; inspect Spotify before retrying."
                  : "Read request timed out.",
                0,
                isWrite,
              ),
            );
          }, timeout);
        }),
      ]);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        !isWrite
          ? `Read failed: ${failureReason(error)}.`
          : "Write outcome is unknown. Inspect Spotify before retrying.",
        0,
        isWrite,
      );
    } finally {
      if (handle) timer.clear(handle);
    }
  };
}
export async function mapLimit(
  items,
  concurrency,
  fn,
  job = { cancelled: false },
) {
  const out = new Array(items.length);
  let next = 0,
    failed = false,
    failure;
  async function worker() {
    while (!job.cancelled && !failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      worker,
    ),
  );
  if (job.cancelled) throw new Error("Operation cancelled.");
  if (failed) throw failure;
  return out;
}

export class Cache {
  constructor(storage, key, maximum = 1000) {
    this.storage = storage;
    this.key = key;
    this.maximum = maximum;
    let value;
    try {
      value = storage.get(key);
    } catch {}
    this.entries = new Map(Object.entries(
      value && typeof value === "object" ? value : {},
    ));
    while (this.entries.size > this.maximum)
      this.entries.delete(this.entries.keys().next().value);
  }
  get(key, now = Date.now()) {
    const entry = this.entries.get(key);
    return entry && entry.until > now ? entry.value : null;
  }
  set(key, value, ttl = 86400000) {
    this.entries.set(key, { value, until: Date.now() + ttl });
    while (this.entries.size > this.maximum)
      this.entries.delete(this.entries.keys().next().value);
  }
  save() {
    this.storage.set(this.key, Object.fromEntries(this.entries));
  }
}
