import { MusicBrainz } from "./musicbrainz.mjs";
import {
  LIKED_URI,
  MAX_LIKED_ITEMS,
  MAX_LIKED_PAGES,
  likedInput,
  validUsername,
  encodeCollectionPage,
  decodeCollectionPage,
  contextPageUrl,
} from "./liked-songs.mjs";
import { Cache, makeHttp, mapLimit, RequestError, failureReason, nativePlaylistFailure } from "./net.mjs";
import {
  MAX_ITEMS,
  clean,
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
  contextTrackMetadata,
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
    : error instanceof ReadError || error instanceof RequestError
      ? error.message
      : failureReason(error);
export class DataClient {
  constructor(api, request = makeHttp()) {
    this.api = api;
    this.request = request;
    // v2 invalidates negative genre results and track rows that lost artist IDs in 0.1.0.
    this.cache = new Cache(api.Platform.Storage, "metadata-cache-v2", 1200);
    this.musicbrainz = new MusicBrainz(this.request, this.cache);
    this.webUnavailable = new Map();
    this.inflight = new Map();
    this.accountReads = new WeakMap();
    this.lastfmGenreFailure = null;
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
  async paged(path, job, progress = (_message) => {}, maximum = MAX_ITEMS) {
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
        rows.length > maximum ||
        ((page.next || offset < page.total) && rows.length >= maximum)
      )
        throw new ReadError(`Collection exceeds ${maximum} items`);
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
  async rawMetadata(kind, uri, job) {
    check(job);
    const token = this.api.Platform.Session.accessToken;
    if (!token) throw new ReadError("Spotify session unavailable");
    const raw = await this.request(
      `https://spclient.wg.spotify.com/metadata/4/${kind}/${uriToHex(uri)}?market=from_token`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    check(job);
    return raw;
  }
  async rawMetadataTrack(uri, job) {
    const key = `track-raw:${uri}`, cached = this.cache.get(key);
    if (cached) return cached;
    const raw = await this.rawMetadata("track", uri, job);
    if (!raw?.name) throw new ReadError("track metadata unavailable");
    const track = { ...rawTrack(raw, uri), uri };
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
    try { return this.currentTrack(uri); } catch {}
    const value = await this.routes(
      "Track",
      [
        ["Native metadata", () => this.nativeTrack(uri, job)],
        ["Raw Spotify metadata", () => this.rawMetadataTrack(uri, job)],
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
            ["Current player", () => this.currentTrack(row.uri)],
            ["Native metadata", () => this.nativeTrack(row.uri, job)],
            ["Raw Spotify metadata", () => this.rawMetadataTrack(row.uri, job)],
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
  async spotifyUsername(hint, job = {}) {
    if (hint) {
      if (!validUsername(hint))
        throw new ReadError(
          "Enter your Spotify username, not a display name or URL",
        );
      return hint;
    }
    if (!this.accountReads.has(job))
      this.accountReads.set(job, this.resolveSpotifyUsername(job));
    return this.accountReads.get(job);
  }
  async resolveSpotifyUsername(job) {
    check(job);
    let context;
    try {
      context = this.api.Player?.getState?.().contextUri;
    } catch {}
    const current = likedInput(context);
    if (current?.username) return current.username;
    const user = await this.routes(
      "Account",
      [
        [
          "Native account",
          async () => {
            if (typeof this.api.User?.getCurrent !== "function")
              throw new ReadError("not exposed by this host");
            let timer;
            try {
              return await Promise.race([
                this.api.User.getCurrent(),
                new Promise((_, reject) => {
                  timer = setTimeout(
                    () => reject(new ReadError("account read timed out")),
                    17000,
                  );
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          },
        ],
        ["Spotify profile", () => this.spotify("/me")],
      ],
      job,
    );
    let username;
    if (typeof user?.uri === "string")
      try {
        username = decodeURIComponent(
          /^spotify:user:([^:]+)$/.exec(user.uri)?.[1] || "",
        );
      } catch {}
    if (!validUsername(username)) username = user?.username || user?.id;
    if (!validUsername(username))
      throw new ReadError(
        "Account username unavailable. Enter your Spotify username in the Liked Songs username field",
      );
    return username;
  }
  async hydrateLikes(rows, job, progress) {
    let completed = 0;
    return mapLimit(
      rows,
      2,
      async (row, index) => {
        check(job);
        let track;
        try {
          if (row.metadataTrack) track = row.metadataTrack;
          else [track] = await this.hydrate([row], job);
        } catch (error) {
          check(job);
          // Membership was fully paged and checked before enrichment. Retain an
          // unreadable row rather than failing the whole library or losing a like.
          // Cancellation and provider rate limits still stop the operation.
          if (status(error) === 429) throw error;
          track = {
            ...normalizeTrack({
              uri: row.uri,
              name: "Track metadata unavailable",
              artists: [],
            }),
            addedAt: Number.isFinite(row.addedAt) ? row.addedAt : null,
            metadataUnavailable: true,
            metadataStatus: reason(error),
          };
        }
        completed++;
        if (completed <= 10 || completed % 100 === 0 || completed === rows.length)
          progress?.(`Read metadata ${completed} of ${rows.length} liked songs`);
        return { ...track, addedAt: Number.isFinite(row.addedAt) ? row.addedAt : track.addedAt, sourceIndex: index, liked: true };
      },
      job,
    );
  }
  async likedCollection(hint, job, progress) {
    const username = await this.spotifyUsername(hint, job),
      rows = [],
      seen = new Set(),
      cursors = new Set();
    let token = "",
      sync = "",
      scanned = 0;
    while (true) {
      check(job);
      if (cursors.has(token))
        throw new ReadError("Collection pagination repeated a cursor");
      cursors.add(token);
      if (cursors.size > MAX_LIKED_PAGES)
        throw new ReadError(`Saved library scan exceeds ${MAX_LIKED_PAGES} pages`);
      const access = this.api.Platform.Session.accessToken;
      if (!access) throw new ReadError("Spotify session unavailable");
      const bytes = await this.request(
        "https://spclient.wg.spotify.com/collection/v2/paging",
        {
          method: "POST",
          readOnly: true,
          responseType: "bytes",
          headers: {
            Authorization: `Bearer ${access}`,
            Accept: "application/vnd.collection-v2.spotify.proto",
            "Content-Type": "application/vnd.collection-v2.spotify.proto",
          },
          body: encodeCollectionPage(username, token),
        },
      );
      check(job);
      let page;
      try {
        page = decodeCollectionPage(bytes);
      } catch (error) {
        const detail = /^(Invalid|Truncated|Unsupported|Collection)/.test(error.message || "")
          ? ` (${error.message.slice(0, 120)})` : "";
        throw new ReadError(`Incomplete or invalid saved collection response${detail}`);
      }
      if (sync && page.sync && sync !== page.sync)
        throw new ReadError(
          "Saved collection changed during loading; retry the read",
        );
      if (page.sync) sync = page.sync;
      scanned += page.items.length;
      for (const item of page.items) {
        if (item.removed || !isTrack(item.uri)) continue;
        if (seen.has(item.uri))
          throw new ReadError(
            "Saved collection repeated a track; retry the read",
          );
        seen.add(item.uri);
        rows.push(item);
      }
      if (rows.length > MAX_LIKED_ITEMS || scanned > 1000000)
        throw new ReadError(`Liked Songs exceeds ${MAX_LIKED_ITEMS} tracks or the saved-item scan guard`);
      progress?.(
        `Read ${rows.length} liked songs (${scanned} saved items checked)`,
      );
      if (!page.next) break;
      if (!page.items.length)
        throw new ReadError(
          "Saved collection returned an empty nonterminal page",
        );
      token = page.next;
    }
    const tracks = await this.hydrateLikes(rows, job, progress);
    return {
      uri: LIKED_URI,
      name: "Liked Songs",
      tracks,
      source: "Spotify saved collection",
      skipped: 0,
    };
  }
  async likedWeb(job, progress) {
    const rows = await this.paged("/me/tracks", job, progress, MAX_LIKED_ITEMS),
      tracks = trackRows(rows).map((t) => ({ ...t, liked: true }));
    return {
      uri: LIKED_URI,
      name: "Liked Songs",
      tracks,
      source: "Spotify saved-tracks API",
      skipped: rows.length - tracks.length,
    };
  }
  async likedContext(hint, job, progress) {
    const username = await this.spotifyUsername(hint, job),
      contextUri = `spotify:user:${encodeURIComponent(username)}:collection`;
    const request = async (url) => {
      check(job);
      const token = this.api.Platform.Session.accessToken;
      if (!token) throw new ReadError("Spotify session unavailable");
      return this.request(contextPageUrl(url), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    };
    const context = await request(`/context-resolve/v1/${contextUri}`);
    check(job);
    if (
      context.loading ||
      !Array.isArray(context.pages) ||
      !context.pages.length
    )
      throw new ReadError("Liked Songs context is not fully loaded");
    if (context.uri && context.uri !== contextUri && context.uri !== LIKED_URI)
      throw new ReadError("Resolver returned a different collection");
    const pages = [...context.pages],
      scheduled = new Set(),
      processed = new Set(),
      seenTracks = new Set(),
      rows = [];
    context.pages = []; // Release the response's page references as each page is consumed.
    for (const p of pages) {
      const u = p.page_url || p.pageUrl;
      if (u) scheduled.add(contextPageUrl(u));
    }
    for (let i = 0; i < pages.length; i++) {
      check(job);
      if (i >= MAX_LIKED_PAGES)
        throw new ReadError(`Liked Songs context exceeds ${MAX_LIKED_PAGES} pages`);
      let page = pages[i];
      if (page.loading)
        throw new ReadError("Liked Songs page is still loading");
      const pageUrl = page.page_url || page.pageUrl;
      if (pageUrl) {
        const url = contextPageUrl(pageUrl);
        if (processed.has(url)) throw new ReadError("Liked Songs page loop");
        processed.add(url);
        if (!Array.isArray(page.tracks)) page = await request(url);
      }
      if (page.loading || !Array.isArray(page.tracks))
        throw new ReadError("Incomplete Liked Songs page");
      for (const item of page.tracks) {
        if (!isTrack(item.uri)) continue;
        if (seenTracks.has(item.uri))
          throw new ReadError("Liked Songs repeated a track during loading");
        seenTracks.add(item.uri);
        rows.push({ uri: item.uri, addedAt: null, metadataTrack: contextTrackMetadata(item) });
      }
      if (rows.length > MAX_LIKED_ITEMS)
        throw new ReadError(`Liked Songs exceeds ${MAX_LIKED_ITEMS} tracks`);
      progress?.(`Read ${rows.length} liked songs`);
      const next = page.next_page_url || page.nextPageUrl;
      if (next) {
        const url = contextPageUrl(next);
        if (processed.has(url)) throw new ReadError("Liked Songs page loop");
        if (!scheduled.has(url)) {
          scheduled.add(url);
          pages.push({ page_url: url });
        }
      }
      pages[i] = null;
    }
    const count = context.metadata?.track_count;
    if (/^\d+$/.test(String(count)) && Number(count) !== rows.length)
      throw new ReadError("Incomplete Liked Songs context track count");
    const tracks = await this.hydrateLikes(rows, job, progress);
    return {
      uri: LIKED_URI,
      name: "Liked Songs",
      tracks,
      source: "Spotify Liked Songs context",
      skipped: 0,
    };
  }
  async likedSongs(job = {}, progress, hint = "") {
    try {
      return await this.routes(
        "Liked Songs",
        [
          ["Liked Songs context", () => this.likedContext(hint, job, progress)],
          ["Saved collection", () => this.likedCollection(hint, job, progress)],
          ["Saved tracks API", () => this.likedWeb(job, progress)],
        ],
        job,
      );
    } finally {
      this.cache.save();
    }
  }
  async collection(input, job, progress, options = {}) {
    const liked = likedInput(input);
    if (liked)
      return this.likedSongs(job, progress, options.username || liked.username);
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
            try {
              const raw = await this.rawMetadata("artist", uri, job);
              const values = nativeGenres(raw);
              if (values.length) return values;
            } catch (error) {
              check(job);
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
    let value;
    try {
      value = await this.request(`https://ws.audioscrobbler.com/2.0/?${query}`);
    } catch (error) {
      const code = status(error);
      if (code >= 500)
        throw new RequestError(`Last.fm is temporarily unavailable (HTTP ${code}). Your saved API key was kept; try again later.`, code);
      throw error;
    }
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
    if (track.metadataUnavailable)
      return {
        ...track,
        genres: [],
        genreSource: "Unknown",
        genreStatus: "Track metadata is unavailable.",
      };
    check(job);
    const strategy = options.lastfmFirst ? "lastfm-first" : "spotify-first";
    const key = `genres:${strategy}:${options.key ? "lastfm" : "no-key"}:${options.musicbrainz ? "mb" : "no-mb"}:${track.uri}`,
      cached = this.cache.get(key);
    if (cached) return { ...track, ...cached };
    let tags = [],
      source = "Unknown",
      failure = null,
      lastfmWarning = "";
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
      const recent = this.lastfmGenreFailure;
      if (recent?.key === options.key && recent.until > Date.now()) {
        lastfmWarning = recent.warning;
        return;
      }
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
          check(job);
          if (error.providerCode === 6 || error.providerCode === 7) continue;
          if (status(error) === 429 || error.providerCode === 29)
            throw new RequestError("Last.fm rate limit (HTTP 429). Wait before retrying.", 429);
          const code = status(error), providerCode = Number(error.providerCode) || 0;
          const temporary = code >= 500 || (!code && !providerCode) || [11, 16].includes(providerCode);
          lastfmWarning = temporary
            ? `Last.fm temporarily unavailable${code ? ` (HTTP ${code})` : ""}. Your saved API key was kept.`
            : `Last.fm rejected the request${providerCode ? ` (code ${providerCode})` : code ? ` (HTTP ${code})` : ""}. Check the saved key and provider settings.`;
          // Do not send a failing request once per song in a large library.
          // A changed key bypasses this in-memory cooldown; nothing is removed.
          this.lastfmGenreFailure = { key: options.key, warning: lastfmWarning, until: Date.now() + 60000 };
          return;
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
    if (!tags.length && options.musicbrainz) {
      try {
        let identified = track;
        if (!track.artists.some(a => /^spotify:artist:[A-Za-z0-9]{22}$/.test(a.uri || ""))) {
          try { identified = await this.identifyTrack(track, job); }
          catch (error) { check(job); if (status(error) === 429) throw error; }
        }
        const value = await this.musicbrainz.artist(identified, job);
        tags = value.genres;
        if (tags.length) source = value.genreSource;
      } catch (error) {
        check(job);
        if (status(error) === 429) throw error;
        failure = error;
      }
    }
    check(job);
    const value = {
      genres: tags,
      genreSource: source,
      genreStatus: tags.length
        ? lastfmWarning ? `${lastfmWarning} Results use ${source}.` : ""
        : [lastfmWarning, failure
          ? `Genre lookup unavailable (${reason(failure)}). Try MusicBrainz fallback or your own Last.fm key for title/artist tag lookup.`
          : "No genre labels were supplied by the other enabled providers."].filter(Boolean).join(" "),
    };
    // Negative/failed results are deliberately not cached across retries.
    if (tags.length) this.cache.set(key, { ...value, genreStatus: "" }, 7 * 86400000);
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
          completed++;
          if (tracks.length <= 1000 || completed % 100 === 0 || completed === tracks.length)
            progress(`Classified ${completed} of ${tracks.length}`);
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
  async nativeCopy(tracks, name, token, expected, job, progress = (_message) => {}) {
    requireConfirmation(token, expected);
    check(job);
    if (typeof this.api.Playlists?.create !== "function" || typeof this.api.Playlists?.addTracks !== "function")
      throw new Error("Native playlist service is not exposed by this host.");
    if (!name?.trim()) throw new Error("Give the new playlist a name.");
    const uris = tracks.map(t => idFromUri(t.uri, "track").uri);
    if (!uris.length || uris.length > MAX_ITEMS) throw new Error("Preview between 1 and 10,000 tracks first.");
    const journal = { action: "native-copy", startedAt: Date.now(), requested: uris.length, completed: 0, uri: "", phase: "creating" };
    this.api.Platform.Storage.set("last-write-v1", { ...journal });
    const invoke = async (operation, args) => {
      // A timed-out bridge call may still finish. Never resend it automatically.
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(() => operation === "playlists.create"
            ? this.api.Playlists.create(args.name)
            : this.api.Playlists.addTracks(args.uri, args.uris)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new RequestError("Native playlist request timed out; its outcome is unknown.", 0, true)), 30000); }),
        ]);
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw nativePlaylistFailure(error) || new RequestError(`Native playlist service: ${reason(error)}.`, status(error), true);
      } finally { clearTimeout(timer); }
    };
    try {
      const created = await invoke("playlists.create", { name: name.trim().slice(0, 100) });
      try { journal.uri = idFromUri(created?.uri, "playlist").uri; }
      catch { throw new RequestError("Native playlist response did not identify the created copy.", 0, true); }
      journal.phase = "adding";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      for (let i = 0; i < uris.length; i += 100) {
        check(job);
        await invoke("playlists.addTracks", { uri: journal.uri, uris: uris.slice(i, i + 100) });
        journal.completed += Math.min(100, uris.length - i);
        this.api.Platform.Storage.set("last-write-v1", { ...journal });
        progress(`Saved ${journal.completed} of ${uris.length} to the native copy`);
        // Let the host render progress/cancellation between acknowledged batches.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      journal.phase = "complete";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      return journal;
    } catch (error) {
      const step = journal.uri ? "Adding tracks to the new copy" : "Creating the new copy";
      journal.phase = error.unknown ? "unknown" : "stopped";
      this.api.Platform.Storage.set("last-write-v1", { ...journal });
      throw new Error(`${step}: ${error.message} Confirmed ${journal.completed}/${uris.length}.${journal.uri ? ` New copy: ${journal.uri}.` : ""} Inspect Spotify before repeating this action.`);
    }
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
      let id;
      try { ({ id } = idFromUri(journal.uri, "playlist")); }
      catch { throw new RequestError("Spotify did not identify the created copy; its outcome is unknown.", 0, true); }
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
