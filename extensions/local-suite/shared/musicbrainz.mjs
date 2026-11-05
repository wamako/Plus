import { clean, genreTags } from "./model.mjs";
import { RequestError } from "./net.mjs";
const mbid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const check = job => { if (job?.cancelled) throw new Error("Operation cancelled."); };
// One request at a time, at least 1.1 seconds apart per extension. Only invoked
// after the user opts in; a provider rate limit stops the enclosing operation.
export class MusicBrainz {
  constructor(request, cache, clock = { now: Date.now, wait: ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    this.request = request;
    this.cache = cache;
    this.clock = clock;
    this.tail = Promise.resolve();
    this.next = 0;
    this.pending = new Map();
  }
  get(path, job) {
    const read = this.tail.then(async () => {
      check(job);
      const delay = this.next - this.clock.now();
      if (delay > 0) await this.clock.wait(delay);
      check(job);
      this.next = this.clock.now() + 1100;
      const data = await this.request(`https://musicbrainz.org/ws/2/${path}`, {
        headers: { Accept: "application/json", "User-Agent": "SpotifyPlusLocalExtensions/0.1.5 (https://github.com/wamako/Plus)" },
      });
      check(job);
      return data;
    });
    this.tail = read.catch(() => {});
    return read;
  }
  async artist(track, job) {
    const artist = track.artists.find(a => a.name?.trim());
    if (!artist) throw new RequestError("An artist name is required for MusicBrainz lookup.");
    const key = `musicbrainz-artist:${artist.uri || clean(artist.name)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = (async () => {
        const escaped = artist.name.replace(/[\\"]/g, "\\$&");
        const query = new URLSearchParams({ query: `artist:"${escaped}"`, limit: "100", fmt: "json" });
        const result = await this.get(`artist/?${query}`, job);
        if (!Array.isArray(result?.artists) || !Number.isInteger(result.count) || result.count > 100)
          throw new RequestError("MusicBrainz artist results are incomplete or ambiguous.");
        const exact = result.artists.filter(a => mbid.test(a.id || "") && Number(a.score) === 100 && clean(a.name) === clean(artist.name));
        if (exact.length !== 1) throw new RequestError("MusicBrainz found no unique exact artist match; no genre was guessed.");
        const data = await this.get(`artist/${exact[0].id}?inc=genres%2Burl-rels&fmt=json`, job);
        if (data?.id !== exact[0].id || clean(data.name) !== clean(artist.name))
          throw new RequestError("MusicBrainz artist identity did not match.");
        if (/^spotify:artist:[A-Za-z0-9]{22}$/.test(artist.uri || "")) {
          const expected = `https://open.spotify.com/artist/${artist.uri.split(":")[2]}`;
          const linked = (data.relations || []).some(r => {
            try { const u = new URL(r.url?.resource); return u.origin + u.pathname.replace(/\/$/, "") === expected; }
            catch { return false; }
          });
          if (!linked) throw new RequestError("MusicBrainz did not confirm this Spotify artist identifier; no genre was guessed.");
        }
        const genres = genreTags((data.genres || []).filter(g => Number(g.count) > 0));
        const value = { genres, genreSource: artist.uri ? "MusicBrainz artist genres" : "MusicBrainz artist genres (name match)" };
        if (genres.length) this.cache.set(key, value, 7 * 86400000);
        return value;
      })();
      this.pending.set(key, pending);
      pending.finally(() => this.pending.delete(key)).catch(() => {});
    }
    const value = await pending;
    check(job);
    return value;
  }
}
