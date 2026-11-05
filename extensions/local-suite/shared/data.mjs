import { Cache, makeHttp, mapLimit, RequestError } from "./net.mjs";
import {
  MAX_ITEMS,
  idFromUri,
  spotifyUri,
  normalizeTrack,
  genreTags,
  requireConfirmation,
} from "./model.mjs";
import {
  rawTrack,
  uriToHex,
  withAlbum,
  nativeGenres,
} from "./native-metadata.mjs";
const check = (job) => {
  if (job?.cancelled) throw new Error("Operation cancelled.");
};
const isTrack = (uri) => /^spotify:track:[A-Za-z0-9]{22}$/.test(uri || "");
const trackRows = (rows) =>
  rows.map(normalizeTrack).filter((t) => isTrack(t.uri));
class ReadError extends Error {}
const status = (error) =>
  Number(error?.status) ||
  Number(/\b(401|403|404|405|429|5\d\d)\b/.exec(error?.message || "")?.[1]) ||
  0;
const reason = (error) =>
  status(error)
    ? `HTTP ${status(error)}`
    : error instanceof ReadError
      ? error.message
      : "unavailable";
export class DataClient {
  constructor(api, request = makeHttp()) {
    this.api = api;
    this.request = request;
    // v2 invalidates negative genre results and track rows that lost artist IDs in 0.1.0.
    this.cache = new Cache(api.Platform.Storage, "metadata-cache-v2", 1200);
    this.webUnavailable = new Map();
    this.inflight = new Map();
  }
  async spotify(path, method = "GET", body) {
    if (!/^\/[A-Za-z0-9/?=&%._-]+$/.test(path))
      throw new Error("Invalid Spotify API path.");
    const token = this.api.Platform.Session.accessToken;
    if (!token)
      throw new Error(
        "Spotify session is unavailable. Reopen Spotify and try again.",
      );
    return this.request(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async native(method, uri, job) {
    check(job);
    if (typeof this.api.Internal?.[method] !== "function")
      throw new ReadError("not exposed by this host");
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => this.api.Internal[method](uri)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new ReadError("timed out")), 17000);
        }),
      ]);
      check(job);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  async routes(label, routes, job) {
    const failures = [];
    for (const [name, read] of routes) {
      check(job);
      try {
        const result = await read();
        check(job);
        return result;
      } catch (error) {
        check(job);
        if (status(error) === 429)
          throw new ReadError(
            `${label}: provider rate limit (HTTP 429). Wait before retrying.`,
          );
        failures.push(`${name}: ${reason(error)}`);
      }
    }
    throw new ReadError(
      `${label} could not be read. ${failures.join("; ")}. Check that this item opens in Spotify. No partial preview was used.`,
    );
  }
  async paged(path, job, progress = (_message) => {}) {
    const rows = [];
    let offset = 0;
    while (true) {
      check(job);
      const page = await this.spotify(
        `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=50`,
      );
      if (!Array.isArray(page?.items))
        throw new ReadError("Invalid collection response");
      rows.push(...page.items);
      offset += page.items.length;
      progress(
        `Loaded ${offset}${Number.isFinite(page.total) ? ` of ${page.total}` : ""} items`,
      );
      if (
        rows.length > MAX_ITEMS ||
        ((page.next || offset < page.total) && rows.length >= MAX_ITEMS)
      )
        throw new ReadError(`Collection exceeds ${MAX_ITEMS} items`);
      if (!page.next && !(Number.isFinite(page.total) && offset < page.total))
        break;
      if (!page.items.length)
        throw new ReadError("Incomplete collection response");
    }
    check(job);
    return rows;
  }
  async nativeTrack(uri, job) {
    const key = `track-native:${uri}`,
      cached = this.cache.get(key);
    if (cached) return cached;
    const value = await this.native("getTrack", uri, job);
    if (!value?.title && !value?.name)
      throw new ReadError("track metadata unavailable");
    const track = normalizeTrack({
      ...value,
      uri: value.uri || uri,
      explicit: undefined,
    });
    this.cache.set(key, track);
    return track;
  }
  async webTrack(uri, job) {
    check(job);
    const key = `track-web:${uri}`,
      cached = this.cache.get(key);
    if (cached) return cached;
    const { id } = idFromUri(uri, "track");
    const raw = await this.spotify(`/tracks/${id}`);
    check(job);
    if (!raw?.uri || !raw?.name)
      throw new ReadError("track metadata unavailable");
    const track = normalizeTrack(raw);
    this.cache.set(key, track);
    return track;
  }
  currentTrack(uri) {
    let current;
    try {
      current = this.api.Player?.getCurrentTrack?.();
    } catch {}
    if (current?.uri !== uri || !current?.title)
      throw new ReadError("not the current track");
    return normalizeTrack({ ...current, explicit: undefined });
  }
  async track(uri, job) {
    idFromUri(uri, "track");
    const value = await this.routes(
      "Track",
      [
        ["Native metadata", () => this.nativeTrack(uri, job)],
        ["Spotify Web API", () => this.webTrack(uri, job)],
        ["Current player", () => this.currentTrack(uri)],
      ],
      job,
    );
    this.cache.save();
    return value;
  }
  async hydrate(rows, job, progress = (_message) => {}, album) {
    let count = 0;
    return mapLimit(
      rows,
      2,
      async (row, index) => {
        check(job);
        if (!isTrack(row.uri)) return row;
        const metadata = await this.routes(
          `Track ${index + 1}`,
          [
            ["Native metadata", () => this.nativeTrack(row.uri, job)],
            ["Spotify Web API", () => this.webTrack(row.uri, job)],
          ],
          job,
        );
        progress(`Read metadata ${++count} of ${rows.length}`);
        const track = album ? withAlbum(metadata, album) : metadata;
        // Keep collection timestamps and duplicate occurrences while enriching metadata.
        return {
          ...track,
          sourceIndex: index,
          rowId: row.rowId || row.itemId || "",
          addedAt: Number.isFinite(row.addedAt)
            ? row.addedAt
            : /^\d+$/.test(row.timestamp || "")
              ? Number(row.timestamp)
              : null,
        };
      },
      job,
    );
  }
  async nativeAlbum(uri, job, progress) {
    const album = await this.native("getAlbum", uri, job);
    if (!album || !Array.isArray(album.discs))
      throw new ReadError("album metadata unavailable");
    const rows = album.discs.flatMap((disc) =>
      Array.isArray(disc.tracks) ? disc.tracks.map((uri) => ({ uri })) : [],
    );
    const rawCount = Array.isArray(album.raw?.disc)
      ? album.raw.disc.reduce(
          (n, disc) => n + (Array.isArray(disc.track) ? disc.track.length : 0),
          0,
        )
      : rows.length;
    if (
      !rows.length ||
      rows.length !== rawCount ||
      rows.some((row) => !isTrack(row.uri))
    )
      throw new ReadError("Incomplete album track list");
    if (rows.length > MAX_ITEMS)
      throw new ReadError(`Album exceeds ${MAX_ITEMS} items`);
    const tracks = await this.hydrate(rows, job, progress, { ...album, uri });
    return {
      uri,
      name: album.name || "Album",
      tracks,
      source: "Native album metadata",
      skipped: 0,
    };
  }
  async webAlbum(uri, job, progress) {
    const { id } = idFromUri(uri, "album"),
      album = await this.spotify(`/albums/${id}`);
    if (!album?.name) throw new ReadError("album metadata unavailable");
    const rows = await this.paged(`/albums/${id}/tracks`, job, progress);
    const tracks = trackRows(rows.map((item) => ({ ...item, album })));
    return {
      uri,
      name: album.name,
      tracks,
      source: "Spotify Web API",
      skipped: rows.length - tracks.length,
    };
  }
  async nativePlaylist(uri, job, progress) {
    const page = await this.native("getPlaylist", uri, job);
    if (!Array.isArray(page?.items))
      throw new ReadError("playlist metadata unavailable");
    if (
      page.truncated ||
      page.position !== 0 ||
      !Number.isInteger(page.length) ||
      page.length !== page.items.length
    )
      throw new ReadError("Incomplete native playlist response");
    if (page.length > MAX_ITEMS)
      throw new ReadError(`Playlist exceeds ${MAX_ITEMS} items`);
    const hydrated = await this.hydrate(page.items, job, progress);
    const tracks = hydrated.filter((t) => isTrack(t.uri));
    return {
      uri,
      name: page.name || "Playlist",
      tracks,
      source: "Native playlist metadata",
      skipped: page.items.length - tracks.length,
    };
  }
  async webPlaylist(uri, job, progress) {
    const { id } = idFromUri(uri, "playlist");
    let rows, meta;
    // A metadata 404 must not prevent trying the independently addressable item endpoint.
    try {
      meta = await this.spotify(`/playlists/${id}`);
    } catch (error) {
      if (![401, 403, 404].includes(status(error))) throw error;
    }
    try {
      rows = await this.paged(`/playlists/${id}/items`, job, progress);
    } catch (error) {
      if (![404, 405].includes(status(error))) throw error;
      rows = await this.paged(`/playlists/${id}/tracks`, job, progress);
    }
    const tracks = trackRows(rows);
    return {
      uri,
      name: meta?.name || "Playlist",
      tracks,
      source: "Spotify Web API",
      skipped: rows.length - tracks.length,
    };
  }
  async rpcPlaylist(uri, job, progress) {
    let rows = [],
      offset = 0,
      name = "Playlist";
    while (true) {
      check(job);
      const page = await this.api.Playlists.get(uri, { offset, limit: 100 });
      check(job);
      if (!Array.isArray(page?.items))
        throw new ReadError("Native playlist reader unavailable");
      if (page.offset !== undefined && page.offset !== offset)
        throw new ReadError("Incomplete native playlist response");
      name = page.name || name;
      rows.push(...page.items);
      offset += page.items.length;
      progress?.(`Loaded ${offset} native playlist rows`);
      if (
        rows.length > MAX_ITEMS ||
        (offset < page.total && rows.length >= MAX_ITEMS)
      )
        throw new ReadError(`Playlist exceeds ${MAX_ITEMS} items`);
      if (Number.isFinite(page.total) && offset === page.total) break;
      if (Number.isFinite(page.total) && offset > page.total)
        throw new ReadError("Incomplete native playlist response");
      if (!Number.isFinite(page.total))
        throw new ReadError(
          "Native reader omitted the total; completeness cannot be verified",
        );
      if (!page.items.length)
        throw new ReadError("Incomplete native playlist response");
    }
    const hydrated = await this.hydrate(rows, job, progress),
      tracks = hydrated.filter((t) => isTrack(t.uri));
    return {
      uri,
      name,
      tracks,
      source: "Native read-only playlist fallback",
      skipped: rows.length - tracks.length,
    };
  }
  async collection(input, job, progress) {
    const uri = spotifyUri(input),
      { kind } = idFromUri(uri);
    try {
      if (kind === "track")
        return {
          uri,
          name: "Track",
          tracks: [await this.track(uri, job)],
          source: "Spotify metadata",
          skipped: 0,
        };
      if (kind === "album")
        return await this.routes(
          "Album",
          [
            [
              "Native album metadata",
              () => this.nativeAlbum(uri, job, progress),
            ],
            ["Spotify Web API", () => this.webAlbum(uri, job, progress)],
          ],
          job,
        );
      if (kind === "playlist")
        return await this.routes(
          "Playlist",
          [
            [
              "Native playlist metadata",
              () => this.nativePlaylist(uri, job, progress),
            ],
            ["Spotify Web API", () => this.webPlaylist(uri, job, progress)],
            [
              "Native playlist reader",
              () => this.rpcPlaylist(uri, job, progress),
            ],
          ],
          job,
        );
      throw new ReadError(
        "Load a playlist, album, or track. Artist discographies are not supported.",
      );
    } finally {
      this.cache.save();
    }
  }
  async identifyTrack(track, job) {
    // Albums preserve artist GIDs; the SDK's normalized track model does not.
    // Resolve those identifiers through Spotify's own read-only metadata service.
    const key = `identified:${track.uri}`,
      cached = this.cache.get(key);
    if (cached) return { ...track, ...cached };
    check(job);
    // For the current album, reuse the host's authenticated metadata reader so
    // artist identification does not depend on a separate HTTP client header.
    let state;
    try {
      state = this.api.Player?.getState?.();
    } catch {}
    if (
      state?.trackUri === track.uri &&
      /^spotify:album:[A-Za-z0-9]{22}$/.test(state.contextUri || "")
    ) {
      try {
        const album = await this.native("getAlbum", state.contextUri, job);
        if (album?.discs?.some((disc) => disc.tracks?.includes(track.uri))) {
          const enriched = withAlbum(track, album);
          if (enriched.artists.some((artist) => artist.uri)) {
            this.cache.set(key, enriched);
            return enriched;
          }
        }
      } catch (error) {
        check(job);
        if (status(error) === 429) throw error;
      }
    }
    const token = this.api.Platform.Session.accessToken;
    if (!token) throw new ReadError("Spotify session unavailable");
    const raw = await this.request(
      `https://spclient.wg.spotify.com/metadata/4/track/${uriToHex(track.uri)}?market=from_token`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    check(job);
    const metadata = rawTrack(raw, track.uri);
    if (metadata.uri !== track.uri) metadata.uri = track.uri;
    const result = {
      ...track,
      artists: metadata.artists.length ? metadata.artists : track.artists,
      albumUri: metadata.albumUri || track.albumUri,
      releaseDate: metadata.releaseDate || track.releaseDate,
    };
    this.cache.set(key, result);
    return result;
  }
  async artistGenres(track, job) {
    let identified = track;
    if (
      !track.artists.some((a) => /^spotify:artist:[A-Za-z0-9]{22}$/.test(a.uri))
    )
      identified = await this.identifyTrack(track, job);
    const ids = [
      ...new Set(
        identified.artists
          .map((a) => a.uri)
          .filter((uri) => /^spotify:artist:[A-Za-z0-9]{22}$/.test(uri)),
      ),
    ];
    if (!ids.length) throw new ReadError("Artist identifiers unavailable");
    const tags = [];
    for (const uri of ids) {
      check(job);
      const key = `artist-genres:${uri}`;
      let genres = this.cache.get(key);
      if (!genres) {
        let shared = this.inflight.get(key);
        if (!shared) {
          shared = (async () => {
            try {
              const artist = await this.native("getArtist", uri);
              const values = nativeGenres(artist);
              if (values.length) return values;
            } catch (error) {
              if (status(error) === 429) throw error;
            }
            // Avoid repeating an unavailable Web-API artist request for every track by this artist.
            if ((this.webUnavailable.get(uri) || 0) > Date.now())
              throw new ReadError("Web artist genres unavailable");
            try {
              const { id } = idFromUri(uri, "artist");
              const artist = await this.spotify(`/artists/${id}`);
              return genreTags(artist?.genres || []);
            } catch (error) {
              if ([401, 403, 404].includes(status(error)))
                this.webUnavailable.set(uri, Date.now() + 300000);
              throw error;
            }
          })();
          this.inflight.set(key, shared);
          shared.finally(() => this.inflight.delete(key)).catch(() => {});
        }
        genres = await shared;
        if (genres.length) this.cache.set(key, genres, 7 * 86400000);
      }
      tags.push(...genres);
    }
    check(job);
    return genreTags(tags);
  }
  async lastfm(params, key) {
    if (!key?.trim())
      throw new Error("Enter your own Last.fm API key to use this provider.");
    const query = new URLSearchParams({
      ...params,
      api_key: key.trim(),
      format: "json",
    });
    const value = await this.request(
      `https://ws.audioscrobbler.com/2.0/?${query}`,
    );
    if (value?.error) {
      const error = new Error(
        `Last.fm rejected this request (code ${Number(value.error) || 0}). Check your API key and username.`,
      );
      error.providerCode = Number(value.error);
      throw error;
    }
    return value;
  }
  async genres(track, options = {}, job) {
    check(job);
    const strategy = options.lastfmFirst ? "lastfm-first" : "spotify-first";
    const key = `genres:${strategy}:${options.key ? "lastfm" : "no-key"}:${track.uri}`,
      cached = this.cache.get(key);
    if (cached) return { ...track, ...cached };
    let tags = [],
      source = "Unknown",
      failure = null;
    const spotify = async () => {
      try {
        tags = await this.artistGenres(track, job);
        if (tags.length) source = "Spotify artist genres";
      } catch (error) {
        check(job);
        if (status(error) === 429) throw error;
        failure = error;
      }
    };
    const lastfm = async () => {
      if (!options.key) return;
      const artist = track.artists[0]?.name || track.artist;
      for (const params of [
        {
          method: "track.gettoptags",
          artist,
          track: track.title,
          autocorrect: "1",
        },
        ...(track.album
          ? [
              {
                method: "album.gettoptags",
                artist,
                album: track.album,
                autocorrect: "1",
              },
            ]
          : []),
        { method: "artist.gettoptags", artist, autocorrect: "1" },
      ]) {
        check(job);
        let result;
        try {
          result = await this.lastfm(params, options.key);
        } catch (error) {
          if (error.providerCode === 6 || error.providerCode === 7) continue;
          throw error;
        }
        tags = genreTags(result?.toptags?.tag || []);
        if (tags.length) {
          source = `Last.fm ${params.method.split(".")[0]} tags`;
          break;
        }
      }
    };
    if (options.lastfmFirst) {
      await lastfm();
      if (!tags.length) await spotify();
    } else {
      await spotify();
      if (!tags.length) await lastfm();
    }
    check(job);
    const value = {
      genres: tags,
      genreSource: source,
      genreStatus: tags.length
        ? ""
        : failure
          ? `Spotify genre lookup unavailable (${reason(failure)}). Add your own Last.fm key for title/artist tag lookup.`
          : "No genre labels were supplied by the provider.",
    };
    // Negative/failed results are deliberately not cached across retries.
    if (tags.length) this.cache.set(key, value, 7 * 86400000);
    if (!options.deferSave) this.cache.save();
    return { ...track, ...value };
  }
  async classify(tracks, options, job, progress = (_message) => {}) {
    let completed = 0;
    try {
      return await mapLimit(
        tracks,
        2,
        async (track) => {
          const value = await this.genres(
            track,
            { ...options, deferSave: true },
            job,
          );
          progress(`Classified ${++completed} of ${tracks.length}`);
          return value;
        },
        job,
      );
    } finally {
      this.cache.save();
    }
  }
  async genreInfo(name) {
    const slug = name.toLowerCase().replace(/:/g, "").replace(/ /g, "-");
    if (!/^[a-z0-9&'._+-]{1,120}$/.test(slug))
      throw new ReadError(
        "No genre directory page is available for this name.",
      );
    let data;
    try {
      data = await this.request(
        `https://lucasoe.github.io/spicetify-genres/api/${encodeURIComponent(slug)}.json`,
      );
    } catch (error) {
      if (status(error) === 404)
        throw new ReadError(
          `The genre directory has no page for “${name}”. Your track lookup is still available.`,
        );
      throw error;
    }
    if (!data?.pageProps)
      throw new ReadError("Genre directory returned an invalid page.");
    return data.pageProps;
  }
  async top(provider, username, key, range = "month", kind = "tracks") {
    if (!username.trim())
      throw new Error("Enter the public username for this provider.");
    if (!["tracks", "artists", "albums"].includes(kind))
      throw new Error("Unsupported ranking.");
    if (provider === "statsfm") {
      const period =
        { week: "weeks", month: "months", all: "lifetime" }[range] || "months";
      const data = await this.request(
        `https://api.stats.fm/api/v1/users/${encodeURIComponent(username.trim())}/top/${kind}?range=${period}`,
      );
      if (!Array.isArray(data?.items))
        throw new Error("Stats.fm returned no ranking data.");
      return data.items.slice(0, 50).map((row) => {
        const item = row[kind.slice(0, -1)] || row;
        return {
          title: item.name || "Unknown",
          artist: item.artists?.map((a) => a.name).join(", ") || "",
          count: typeof row.streams === "number" ? row.streams : null,
          listenedMs: typeof row.playedMs === "number" ? row.playedMs : null,
          uri: item.externalIds?.spotify?.[0]
            ? `spotify:${kind.slice(0, -1)}:${item.externalIds.spotify[0]}`
            : "",
        };
      });
    }
    const result = await this.lastfm(
      {
        method: `user.gettop${kind}`,
        user: username.trim(),
        period:
          { week: "7day", month: "1month", all: "overall" }[range] || "1month",
        limit: "50",
      },
      key,
    );
    const items = result[`top${kind}`]?.[kind.slice(0, -1)] || [];
    if (!Array.isArray(items))
      throw new Error("Last.fm returned an invalid ranking.");
    return items.map((row) => ({
      title: row.name || "Unknown",
      artist: row.artist?.name || "",
      count: Number.isFinite(Number(row.playcount))
        ? Number(row.playcount)
        : null,
      listenedMs: null,
      uri: "",
    }));
  }
  async createCopy(
    tracks,
    name,
    token,
    expected,
    job,
    progress = (_message) => {},
  ) {
    requireConfirmation(token, expected);
    check(job);
    if (!name?.trim()) throw new Error("Give the new playlist a name.");
    const uris = tracks.map((t) => idFromUri(t.uri, "track").uri);
    if (!uris.length || uris.length > MAX_ITEMS)
      throw new Error("Preview between 1 and 10,000 tracks first.");
    const journal = {
      action: "copy",
      startedAt: Date.now(),
      requested: uris.length,
      completed: 0,
      uri: "",
      phase: "creating",
    };
    // A durable journal is required before sending a write. An unknown outcome is never retried automatically.
    this.api.Platform.Storage.set("last-write-v1", journal);
    try {
      const created = await this.spotify("/me/playlists", "POST", {
        name: name.trim().slice(0, 100),
        public: false,
        description: "Created from a preview in Spotify Plus local extensions.",
      });
      journal.uri =
        created?.uri || (created?.id ? `spotify:playlist:${created.id}` : "");
      const { id } = idFromUri(journal.uri, "playlist");
      journal.phase = "adding";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      for (let i = 0; i < uris.length; i += 100) {
        check(job);
        await this.spotify(`/playlists/${id}/items`, "POST", {
          uris: uris.slice(i, i + 100),
        });
        journal.completed += Math.min(100, uris.length - i);
        this.api.Platform.Storage.set("last-write-v1", { ...journal });
        progress(
          `Saved ${journal.completed} of ${uris.length} to the new copy`,
        );
      }
      journal.phase = "complete";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      return journal;
    } catch (error) {
      journal.phase = error.unknown ? "unknown" : "stopped";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      throw new Error(
        `${error.message} Confirmed ${journal.completed}/${uris.length} tracks.${journal.uri ? ` New copy: ${journal.uri}.` : ""} Inspect Spotify before retrying; the source playlist was not changed.`,
      );
    }
  }
  async appendQueue(tracks, token, expected, job, progress = (_message) => {}) {
    requireConfirmation(token, expected);
    check(job);
    const uris = tracks.map((t) => idFromUri(t.uri, "track").uri);
    if (!uris.length || uris.length > 100)
      throw new Error(
        "Queue append is limited to 100 tracks per confirmation. Use a new playlist copy for larger results.",
      );
    const journal = {
      action: "queue-append",
      startedAt: Date.now(),
      requested: uris.length,
      completed: 0,
      phase: "adding",
    };
    this.api.Platform.Storage.set("last-write-v1", journal);
    try {
      for (const uri of uris) {
        check(job);
        await this.spotify(
          `/me/player/queue?uri=${encodeURIComponent(uri)}`,
          "POST",
        );
        journal.completed++;
        this.api.Platform.Storage.set("last-write-v1", { ...journal });
        progress(`Appended ${journal.completed} of ${uris.length}`);
      }
      journal.phase = "complete";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      return journal;
    } catch (error) {
      journal.phase = error.unknown ? "unknown" : "stopped";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      throw new Error(
        `${error.message} Confirmed ${journal.completed}/${uris.length} appended. Inspect the queue before retrying. An active player, Premium, or additional Spotify permissions may be required.`,
      );
    }
  }
}
