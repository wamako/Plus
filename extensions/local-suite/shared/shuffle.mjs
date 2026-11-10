import { idFromUri, requireConfirmation } from "./model.mjs";
import { beginJournal, checkpointJournal, recordFailure } from "./write-journal.mjs";
import { HOST } from "./build-info.mjs";
const JOURNAL = "shuffle-write-v1";
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
// A range is always explicit; changing it must invalidate any prepared ticket.
export function playbackRange(total, size, part = 0) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000 ||
      ![20, SHUFFLE_LIMIT].includes(size) || !Number.isSafeInteger(part) || part < 0)
    throw new Error("Invalid playback range.");
  const count = Math.ceil(total / size), selected = Math.min(part, Math.max(0, count - 1));
  return { count, part: selected, from: selected * size, to: Math.min(total, (selected + 1) * size) };
}
export function mismatchSummary(value) {
  const position = value?.firstMismatchUpcomingPosition;
  if (value?.mode !== "collection" || value?.errorCode !== "SP_SHUFFLE_UNCONFIRMED_ORDER" ||
      !Number.isSafeInteger(position) || position < 1 || position > SHUFFLE_LIMIT) return "";
  return `First mismatch: upcoming position ${position} (song ${position + 1} in this preview). ` +
    "This does not establish whether Spotify skipped, substituted or reordered the song. Check this position in Spotify and copy the diagnostics.";
}

const check = job => { if (job?.cancelled) throw new Error("Operation cancelled."); };
const known = {
  MANUAL_QUEUE: "There are manually queued songs. Clear or play them in Spotify before starting a collection shuffle. Nothing was started.",
  OBSERVER_READY: "Spotify’s queue listener could not start. No command was sent. Load a new preview.",
  QUEUE_LAYOUT: "Spotify’s queue sections could not be read safely. Open its queue, then load a new preview.",
  PLAYER_READY: "Start a song from an album or playlist in Spotify, then prepare a new Shuffle+ preview.",
  PLAY_REFUSED: "Spotify’s native player refused this playback command. Check playback permissions and prepare a new preview.",
  READY: "Start Spotify playback once, then reopen Shuffle+ and load a new preview.",
  PREPARE: `The native playback protocol could not be prepared. Check that R${HOST} is active.`,
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
  const unconfirmed = {
    SEQUENCE_CHANGED: "Playback or the queue changed after the first song started. The remaining selection was not confirmed. Inspect Spotify before trying again.",
    SEQUENCE_REFUSED: "The first song started, but Spotify refused the remaining queue. Inspect playback before trying again.",
    UNCONFIRMED_INITIAL_STATE: "Spotify’s queue listener did not supply its initial state in time. The pending command was not sent. Inspect playback before trying again.",
    UNCONFIRMED_DEADLINE: "The shuffle reached its time limit without full confirmation. Inspect playback before trying again.",
    UNCONFIRMED_NO_CHANGE: "Spotify acknowledged the queue edit, but the observed queue stayed unchanged. Inspect playback before trying again.",
    UNCONFIRMED_ORDER: "Spotify acknowledged the edit, but its observed song order did not match the preview. Inspect playback before trying again.",
    UNCONFIRMED_READBACK: "The queue listener could not confirm the result. Inspect playback before trying again.",
  };
  const result = new Error(unconfirmed[code] || (code === "UNCONFIRMED" ? "Spotify acknowledged the command, but its player and queue did not confirm the previewed order. Inspect playback before trying again." : known[code]) || (mutation
    ? "The native shuffle did not return a confirmed result. Inspect playback before trying again."
    : `Shuffle+ needs the R${HOST} playback adapter. Repatch Spotify with the R${HOST} module, then restart it.`));
  if (code) result.message += ` [SP_SHUFFLE_${code}]`;
  result.unknown = mutation && !known[code];
  return result;
}
export function safeDiagnostics(value) {
  if (!value || value.host !== HOST) throw new Error(`No R${HOST} shuffle diagnostics are available yet.`);
  const out = {host:HOST};
  const enums = {mismatchItemKind:["none","track","delimiter","other"],mismatchProvider:["none","empty","queue","context","autoplay","other"],mode:["queue","collection"],outcome:["not_sent","unknown","confirmed","refused"],requestFormat:["first-track-explicit-queue"],reply:["success","refused"],readbackError:["schema","stream"],stage:["first-track","selected-queue","complete"],readbackStep:["first-initial","first-confirm","selected-initial","selected-confirm","queue-initial","queue-confirm","complete"],playReply:["success","refused"],queueReply:["success","refused"]};
  for (const [key, allowed] of Object.entries(enums)) if (allowed.includes(value[key])) out[key] = value[key];
  for (const key of ["expectedAtMismatchSeenLater","observedIsOrderedSubsequence","mismatchIsQueued","firstInitialStateReceived","queueInitialStateReceived","initialStateTimedOut","playSent","firstTrackConfirmed","queueSent","sent","nativeEditorOptions","queueUnchanged","revisionChanged","currentMatches","historyMatches","uriOrderMatches","uidOrderMatches","visibleOrderMatches","observerStartedBeforeDispatch","observerDisposed","currentPresent","currentUriMatches","currentUidAssigned","selectionPrefixMatches","selectionCompleteInWindow","autoplayTailOnly"])
    if (typeof value[key] === "boolean") out[key] = value[key];
  for (const key of ["firstMismatchUpcomingPosition","observedAtMismatchSelectionPosition","skippedSelectionPositions","unexpectedObservedCount","firstObserverEvents","queueObserverEvents","queuedRequestCount","eventsObserved","postDispatchEvents","expectedTrackCount","expectedNextCount","queuedSlots","observedNextCount","expectedUpcomingCount","matchingUpcomingPrefixCount","autoplayInSelectionCount","autoplayTailCount","contextTailCount","queuedTailCount","otherTailCount","delimiterTailCount"])
    if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100000) out[key] = value[key];
  if (typeof value.errorCode === "string" && /^SP_SHUFFLE_[A-Z_]+$/.test(value.errorCode)) out.errorCode = value.errorCode;
  return out;
}
export class ShuffleClient {
  constructor(api) { this.api = api; }
  async capabilities(job) {
    check(job);
    let value;
    try {
      value = await this.api.ShufflePlus.capabilities();
      if (value?.version !== 1 || !Number.isSafeInteger(value?.host) || value.host < HOST || value?.queueRevision !== "observer-initial-cas" || value?.queueEntryProvider !== "native-factory-default" || value?.observerReadiness !== "await-initial-state" || value?.collectionVerification !== "provider-aware-autoplay" || value?.collectionMode !== "first-track-explicit-queue" || value?.route !== "native-play-and-setqueue" || value?.queueMode !== "native-editor-options" || value?.limit !== SHUFFLE_LIMIT) throw new Error();
    } catch (error) { throw shuffleError(error); }
    check(job);
    return value;
  }
  async diagnostics(job) {
    check(job);
    const value = await this.api.ShufflePlus.diagnostics();
    return safeDiagnostics(value);
  }
  async copyDiagnostics(job) {
    check(job);
    if (!await this.api.ShufflePlus.copyDiagnostics()) throw new Error("Run a shuffle first, then copy its diagnostics before restarting Spotify.");
    return true;
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
  previous() { return this.api.Platform.Storage.get(JOURNAL); }
  needsReview() { return ["pending", "unknown"].includes(this.previous()?.phase); }
  acknowledge() {
    const previous = this.previous();
    if (previous) checkpointJournal(this.api.Platform.Storage, { ...previous, phase: "reviewed" }, JOURNAL);
  }
  async apply(plan, token, expected, job) {
    requireConfirmation(token, expected); check(job);
    if (this.needsReview()) throw new Error("Inspect the previous shuffle's playback and acknowledge it before starting another.");
    if (plan.used) throw new Error("This confirmation was already used. Load a new preview.");
    plan.used = true;
    const journal = beginJournal(this.api.Platform.Storage,
      { ticket: plan.ticket, mode: plan.mode, requested: plan.count, phase: "pending", startedAt: Date.now() }, JOURNAL);
    try {
      const result = await this.api.ShufflePlus.apply(plan.ticket, plan.order);
      if (result?.applied !== plan.count || result?.verification !== "visible-order") throw new Error("Invalid native acknowledgment");
      if (plan.mode === "collection" && (!Number.isSafeInteger(result.autoplayTailCount) || result.autoplayTailCount < 0 || typeof result.selectionCompleteInWindow !== "boolean" || (result.autoplayTailCount > 0 && !result.selectionCompleteInWindow))) throw new Error("Invalid native selection verification");
      journal.phase = "complete";
      checkpointJournal(this.api.Platform.Storage, journal, JOURNAL);
      return result;
    } catch (error) {
      const failure = shuffleError(error, true);
      try { journal.diagnostics = await this.diagnostics(); } catch {}
      const detail = mismatchSummary(journal.diagnostics);
      if (detail) failure.message += ` ${detail}`;
      failure.message += recordFailure(this.api.Platform.Storage, journal, failure, JOURNAL);
      throw failure;
    }
  }
}
