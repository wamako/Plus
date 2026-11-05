import { Cache, makeHttp, mapLimit, RequestError } from "./net.mjs";
import {
  MAX_ITEMS,
  idFromUri,
  spotifyUri,
  normalizeTrack,
  genreTags,
  requireConfirmation,
} from "./model.mjs";

const check = (job) => {
  if (job?.cancelled) throw new Error("Operation cancelled.");
};
const trackRows = (rows) =>
  rows
    .map(normalizeTrack)
    .filter((t) => /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri));
export class DataClient {
  constructor(api, request = makeHttp()) {
    this.api = api;
    this.request = request;
    this.cache = new Cache(api.Platform.Storage, "metadata-cache-v1", 1200);
  }
  async spotify(path, method = "GET", body) {
    // Never accept a URL or a third-party host here: the session token stays at Spotify.
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
  async paged(path, job, progress = (_message) => {}) {
    const rows = [];
    let offset = 0;
    while (true) {
      check(job);
      const page = await this.spotify(
        `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=50`,
      );
      if (!Array.isArray(page?.items))
        throw new Error(
          "Provider returned an invalid collection. No partial preview was used.",
        );
      rows.push(...page.items);
      offset += page.items.length;
      progress(
        `Loaded ${offset}${Number.isFinite(page.total) ? ` of ${page.total}` : ""} items`,
      );
      if (rows.length > MAX_ITEMS || (page.next && rows.length >= MAX_ITEMS))
        throw new Error(
          `This collection exceeds the ${MAX_ITEMS}-item limit. No partial preview was used.`,
        );
      if (!page.next && !(Number.isFinite(page.total) && offset < page.total))
        break;
      if (!page.items.length)
        throw new Error(
          "Incomplete collection response. No partial preview was used.",
        );
    }
    check(job);
    return rows;
  }
  async collection(input, job, progress) {
    const uri = spotifyUri(input),
      { kind, id } = idFromUri(uri);
    if (kind === "track")
      return {
        name: "Track",
        uri,
        tracks: [await this.track(uri)],
        source: "Spotify metadata",
        skipped: 0,
      };
    if (kind === "playlist") {
      let rows,
        meta,
        native = false;
      try {
        meta = await this.spotify(`/playlists/${id}`);
        check(job);
        try {
          rows = await this.paged(`/playlists/${id}/items`, job, progress);
        } catch (error) {
          if (![404, 405].includes(error.status)) throw error;
          rows = await this.paged(`/playlists/${id}/tracks`, job, progress);
        }
      } catch (error) {
        // Read-only fallback only. Never change transport after a write with an uncertain outcome.
        if (![401, 403, 404].includes(error.status)) throw error;
        native = true;
        rows = [];
        let offset = 0;
        while (true) {
          check(job);
          const page = await this.api.Playlists.get(uri, {
            offset,
            limit: 100,
          });
          if (!Array.isArray(page?.items))
            throw new Error(
              "Native playlist reader is unavailable on this Spotify build.",
            );
          meta = { name: page.name };
          rows.push(...page.items);
          offset += page.items.length;
          progress?.(`Loaded ${offset} items using the native reader`);
          if (
            rows.length > MAX_ITEMS ||
            (offset < page.total && rows.length >= MAX_ITEMS)
          )
            throw new Error(
              "Playlist is too large. No partial preview was used.",
            );
          if (
            offset >= page.total ||
            (!Number.isFinite(page.total) && page.items.length < 100)
          )
            break;
          if (!page.items.length)
            throw new Error("Incomplete native playlist response.");
        }
        rows = await mapLimit(
          rows,
          2,
          async (row) => {
            check(job);
            if (!/^spotify:track:/.test(row.uri)) return row;
            const metadata = await this.api.Internal.getTrack(row.uri);
            if (!metadata)
              throw new Error("Native track metadata was unavailable.");
            // R10 normalized metadata does not expose reliable explicit/availability flags.
            return { ...row, track: { ...metadata, explicit: undefined } };
          },
          job,
        );
      }
      check(job);
      const tracks = trackRows(rows);
      return {
        uri,
        name: meta?.name || "Playlist",
        tracks,
        source: native
          ? "Native read-only fallback; some fields unavailable"
          : "Spotify Web API",
        skipped: rows.length - tracks.length,
      };
    }
    if (kind === "album") {
      const album = await this.spotify(`/albums/${id}`);
      const rows = await this.paged(`/albums/${id}/tracks`, job, progress);
      return {
        uri,
        name: album.name || "Album",
        tracks: trackRows(rows.map((item) => ({ ...item, album }))),
        source: "Spotify Web API",
        skipped: rows.length - trackRows(rows).length,
      };
    }
    throw new Error(
      "Load a playlist, album, or track. Artist discographies are not part of this first Android version.",
    );
  }
  async track(uri) {
    const { id } = idFromUri(uri, "track");
    const key = `track:${id}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let track;
    try {
      track = normalizeTrack(await this.spotify(`/tracks/${id}`));
    } catch (error) {
      if (![401, 403, 404].includes(error.status)) throw error;
      const native = await this.api.Internal.getTrack(uri);
      if (!native) throw error;
      track = normalizeTrack({ ...native, explicit: undefined });
    }
    this.cache.set(key, track);
    this.cache.save();
    return track;
  }
  async artistGenres(track, job) {
    const ids = track.artists
      .map((a) => a.uri)
      .filter((uri) => /^spotify:artist:[A-Za-z0-9]{22}$/.test(uri));
    const tags = [];
    for (const uri of ids) {
      check(job);
      const { id } = idFromUri(uri, "artist"),
        key = `artist-genres:${id}`;
      let genres = this.cache.get(key);
      if (!genres) {
        const artist = await this.spotify(`/artists/${id}`);
        genres = genreTags(artist?.genres || []);
        this.cache.set(key, genres, 7 * 86400000);
      }
      tags.push(...genres);
    }
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
    if (value?.error)
      throw new Error(
        `Last.fm rejected this request (code ${Number(value.error) || 0}). Check your API key and username.`,
      );
    return value;
  }
  async genres(track, options = {}, job) {
    check(job);
    const strategy = options.lastfmFirst ? "lastfm-first" : "spotify-first";
    const key = `genres:${strategy}:${options.key ? "lastfm" : "no-key"}:${track.uri}`;
    const cached = this.cache.get(key);
    if (cached) return { ...track, ...cached };
    let tags = [],
      source = "Unknown",
      error = null;
    const spotify = async () => {
      try {
        tags = await this.artistGenres(track, job);
        if (tags.length) source = "Spotify artist genres";
      } catch (e) {
        error = e;
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
        const result = await this.lastfm(params, options.key);
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
    if (!tags.length && error && !options.key)
      source = "Unknown — Spotify artist genres unavailable";
    const value = { genres: tags, genreSource: source };
    this.cache.set(key, value, tags.length ? 7 * 86400000 : 3600000);
    return { ...track, ...value };
  }
  async classify(tracks, options, job, progress = (_message) => {}) {
    let completed = 0;
    try {
      return await mapLimit(
        tracks,
        2,
        async (track) => {
          const value = await this.genres(track, options, job);
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
      throw new Error("No genre directory page is available for this name.");
    const data = await this.request(
      `https://lucasoe.github.io/spicetify-genres/api/${encodeURIComponent(slug)}.json`,
    );
    if (!data?.pageProps)
      throw new Error("Genre directory returned an invalid page.");
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
