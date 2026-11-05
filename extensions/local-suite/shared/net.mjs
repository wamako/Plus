import { AbortController } from "abort-controller";
export class RequestError extends Error {
  constructor(message, status = 0, unknown = false) {
    super(message);
    this.status = status;
    this.unknown = unknown;
  }
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
    "ws.audioscrobbler.com",
    "api.stats.fm",
    "lucasoe.github.io",
  ];
  let cooldown = 0;
  return async function request(url, options = {}) {
    const parsed = hostAllowed(url, hosts),
      method = options.method || "GET";
    if (Date.now() < cooldown)
      throw new RequestError("Provider rate limit: wait before retrying.", 429);
    if (typeof fetcher !== "function")
      throw new Error("This host does not provide fetch.");
    const controller = new AbortController();
    let handle;
    const work = (async () => {
      const response = await fetcher(parsed.toString(), {
        ...options,
        signal: controller.signal,
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
      if (!response.ok)
        throw new RequestError(
          `${parsed.hostname} returned HTTP ${response.status}.`,
          response.status,
          method !== "GET" && response.status >= 500,
        );
      if (response.status === 204) return null;
      return response.json();
    })();
    try {
      return await Promise.race([
        work,
        new Promise((_, reject) => {
          handle = timer.set(() => {
            controller.abort();
            reject(
              new RequestError(
                "Request timed out. A write may have completed; inspect Spotify before retrying.",
                0,
                method !== "GET",
              ),
            );
          }, timeout);
        }),
      ]);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        method === "GET"
          ? "Network request failed."
          : "Write outcome is unknown. Inspect Spotify before retrying.",
        0,
        method !== "GET",
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
  let next = 0;
  async function worker() {
    while (!job.cancelled) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      worker,
    ),
  );
  if (job.cancelled) throw new Error("Operation cancelled.");
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
    this.entries = value && typeof value === "object" ? value : {};
  }
  get(key, now = Date.now()) {
    const entry = this.entries[key];
    return entry && entry.until > now ? entry.value : null;
  }
  set(key, value, ttl = 86400000) {
    this.entries[key] = { value, until: Date.now() + ttl };
    let keys = Object.keys(this.entries);
    while (keys.length > this.maximum) delete this.entries[keys.shift()];
  }
  save() {
    this.storage.set(this.key, this.entries);
  }
}
