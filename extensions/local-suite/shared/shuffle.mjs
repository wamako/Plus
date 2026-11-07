import { idFromUri, requireConfirmation } from "./model.mjs";
export const SHUFFLE_LIMIT = 10000;
// Fisher-Yates: equal probability for each permutation under a uniform RNG.
// Source occurrences (including duplicate URIs) are kept; no artist weighting.
export function permutation(length, rng = Math.random) {
  if (!Number.isSafeInteger(length) || length < 0 || length > 100000) throw new Error("Invalid shuffle size.");
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid random source.");
    const j = Math.floor(value * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
export function shuffleTracks(tracks, rng) { return permutation(tracks.length, rng).map(i => tracks[i]); }
const check = job => { if (job?.cancelled) throw new Error("Operation cancelled."); };
const known = {
  PLAYER_READY: "Start a song from an album or playlist in Spotify, then prepare a new Shuffle+ preview.",
  PLAY_REFUSED: "Spotify’s native player refused this playback command. Check playback permissions and prepare a new preview.",
  READY: "Start Spotify playback once, then reopen Shuffle+ and load a new preview.",
  PREPARE: "The native playback protocol could not be prepared. Check that R16 is active.",
  SHUFFLE_ON: "Turn off Spotify's shuffle in the player before reshuffling the upcoming queue.",
  STALE: "Playback or the queue changed. Load a new preview before applying it.",
  STALE_ORDER: "The current song, history, or upcoming song order changed. Load a new preview before applying it.",
  STALE_OWNER: "Spotify replaced its queue service. Load a new preview before applying it.",
  STALE_OPTIONS: "Spotify’s shuffle setting changed. Load a new preview before applying it.",
  STALE_PLAYER: "Spotify replaced its playback service. Load a new preview before applying it.",
  EXPIRED: "This preview expired. Prepare a new one; previews last two minutes.",
  INPUT: "The shuffle preview was invalid. Prepare a new preview.",
  LIMIT: "Shuffle+ applies 1–10,000 songs at a time. Choose a playback range for a larger collection.",
  UNSUPPORTED_ITEM: "This queue contains non-song items. Use a music-only queue or load a collection.",
  FORBIDDEN: "Spotify refused this playback order. Check this account's playback permissions.",
  NOT_FOUND: "Spotify could not play this collection.",
  CONFLICT: "Spotify rejected the queue update. Refresh the queue and prepare a new preview.",
};
export function shuffleError(error, mutation = false) {
  const code = /\bSP_SHUFFLE_([A-Z_]+)\b/.exec(String(error?.message || ""))?.[1];
  const result = new Error((code === "UNCONFIRMED" ? "Spotify acknowledged the command, but its player and queue did not confirm the previewed order. Inspect playback before trying again." : known[code]) || (mutation
    ? "The native shuffle did not return a confirmed result. Inspect playback before trying again."
    : "Shuffle+ needs the R16 playback adapter. Repatch Spotify with the R16 module, then restart it."));
  if (code) result.message += ` [SP_SHUFFLE_${code}]`;
  result.unknown = mutation && !known[code];
  return result;
}
export class ShuffleClient {
  constructor(api) { this.api = api; }
  async capabilities(job) {
    check(job);
    let value;
    try {
      value = await this.api.ShufflePlus.capabilities();
      if (value?.version !== 1 || !Number.isSafeInteger(value?.host) || value.host < 16 || value?.route !== "native-play-command" || value?.limit !== SHUFFLE_LIMIT) throw new Error();
    } catch (error) { throw shuffleError(error); }
    check(job);
    return value;
  }
  validate(value, count, mode) {
    if (typeof value?.ticket !== "string" || !/^[a-f0-9-]{36}$/.test(value.ticket) ||
        value.mode !== mode || value.count !== count || count < 1 || count > SHUFFLE_LIMIT)
      throw new Error("The native shuffle preview was incomplete. Nothing was applied.");
  }
  async queue(job, rng) {
    await this.capabilities(job);
    let value;
    try { value = await this.api.ShufflePlus.previewQueue(); } catch (error) { throw shuffleError(error); }
    check(job);
    if (!Array.isArray(value?.tracks)) throw new Error("The queue preview was incomplete.");
    this.validate(value, value.tracks.length, "queue");
    value.tracks.forEach(t => idFromUri(t.uri, "track"));
    const order = permutation(value.tracks.length, rng);
    return { ...value, order, tracks: order.map(i => value.tracks[i]), used: false };
  }
  async collection(tracks, context, job) {
    await this.capabilities(job);
    if (!tracks.length || tracks.length > SHUFFLE_LIMIT) throw new Error(known.LIMIT);
    const uris = tracks.map(t => idFromUri(t.uri, "track").uri);
    let value;
    try { value = await this.api.ShufflePlus.prepare(context, uris); } catch (error) { throw shuffleError(error); }
    check(job); this.validate(value, tracks.length, "collection");
    return { ...value, tracks: [...tracks], order: tracks.map((_, i) => i), used: false };
  }
  previous() { return this.api.Platform.Storage.get("shuffle-write-v1"); }
  needsReview() { return ["pending", "unknown"].includes(this.previous()?.phase); }
  acknowledge() {
    const previous = this.previous();
    if (previous) this.api.Platform.Storage.set("shuffle-write-v1", { ...previous, phase: "reviewed" });
  }
  async apply(plan, token, expected, job) {
    requireConfirmation(token, expected); check(job);
    if (this.needsReview()) throw new Error("Inspect the previous shuffle's playback and acknowledge it before starting another.");
    if (plan.used) throw new Error("This confirmation was already used. Load a new preview.");
    plan.used = true;
    const journal = { ticket: plan.ticket, mode: plan.mode, requested: plan.count, phase: "pending", startedAt: Date.now() };
    this.api.Platform.Storage.set("shuffle-write-v1", { ...journal });
    if (this.previous()?.ticket !== journal.ticket || this.previous()?.phase !== "pending")
      throw new Error("Could not save the shuffle action record. Nothing was sent.");
    try {
      const result = await this.api.ShufflePlus.apply(plan.ticket, plan.order);
      if (result?.applied !== plan.count || result?.verification !== "visible-order") throw new Error("Invalid native acknowledgment");
      journal.phase = "complete";
      this.api.Platform.Storage.set("shuffle-write-v1", { ...journal });
      return result;
    } catch (error) {
      const failure = shuffleError(error, true);
      journal.phase = failure.unknown ? "unknown" : "stopped";
      this.api.Platform.Storage.set("shuffle-write-v1", { ...journal });
      throw failure;
    }
  }
}
