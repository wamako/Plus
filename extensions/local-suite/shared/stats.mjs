import { clean, csv } from "./model.mjs";
const trackable = (uri) => /^spotify:(track|local):/.test(String(uri || ""));
export class ListeningTracker {
  constructor(saved = {}, thresholdMs = 30000) {
    this.data = { version: 1, startedAt: Date.now(), events: [], ...saved };
    if (!Array.isArray(this.data.events)) this.data.events = [];
    this.threshold = thresholdMs;
    this.previous = null;
    this.active = null;
    this.seek = false;
  }
  markSeek() {
    this.seek = true;
  }
  sample(sample, now) {
    const previous = this.previous,
      uri = sample?.track?.uri;
    if (!trackable(uri)) {
      this.previous = null;
      this.active = null;
      return;
    }
    const position = Number(sample.positionMs) || 0,
      dt = previous ? now - previous.now : 0,
      delta = previous ? position - previous.position : 0;
    const loop =
      previous &&
      previous.uri === uri &&
      previous.duration > 0 &&
      previous.position >= previous.duration * 0.9 &&
      position < 3000 &&
      dt > 0 &&
      dt < 10000 &&
      !this.seek;
    if (!previous || previous.uri !== uri || loop) {
      this.active = {
        id: `${now}:${this.data.events.length}`,
        uri,
        title: sample.track.title || "",
        artist: sample.track.artist || "",
        album: sample.track.album || "",
        image: sample.track.image || "",
        startedAt: now,
        listenedMs: 0,
        play: false,
      };
      this.data.events.push(this.active);
      if (this.data.events.length > 10000)
        this.data.events.splice(0, this.data.events.length - 10000);
    } else if (
      this.active &&
      previous.playing &&
      dt > 0 &&
      dt <= 60000 &&
      !this.seek &&
      delta >= 0 &&
      Math.abs(delta - dt) <= Math.max(2000, dt * 0.25)
    ) {
      this.active.listenedMs += Math.min(delta, dt);
    }
    const duration = Number(sample.track.durationMs) || 0;
    if (
      this.active &&
      (this.active.listenedMs >= this.threshold ||
        (duration > 0 && this.active.listenedMs >= duration * 0.9))
    )
      this.active.play = true;
    this.seek = false;
    this.previous = {
      uri,
      position,
      now,
      duration,
      playing: sample.isPlaying && !sample.isPaused && !sample.isBuffering,
    };
  }
  snapshot() {
    return {
      version: 1,
      startedAt: this.data.startedAt,
      events: this.data.events.map((row) => ({ ...row })),
    };
  }
  pause() {
    this.previous = null;
    this.active = null;
  }
}
export function aggregate(events, { after = 0, before = Infinity } = {}) {
  const selected = events.filter(
    (e) => e.startedAt >= after && e.startedAt < before,
  );
  const maps = { tracks: new Map(), artists: new Map(), albums: new Map() },
    days = {},
    hours = Array(24).fill(0),
    weekdays = Array(7).fill(0);
  let listenedMs = 0,
    plays = 0;
  for (const e of selected) {
    const ms = Number(e.listenedMs) || 0;
    listenedMs += ms;
    if (e.play) plays++;
    const date = new Date(e.startedAt),
      day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    days[day] = (days[day] || 0) + ms;
    hours[date.getHours()] += ms;
    weekdays[date.getDay()] += ms;
    for (const [kind, key, label] of [
      ["tracks", e.uri, e.title],
      ["artists", clean(e.artist), e.artist],
      ["albums", `${clean(e.artist)}:${clean(e.album)}`, e.album],
    ]) {
      if (!key || !label) continue;
      const previous = maps[kind].get(key) || {
        key,
        title: label,
        artist: e.artist,
        uri: kind === "tracks" ? e.uri : "",
        count: 0,
        listenedMs: 0,
      };
      previous.count += e.play ? 1 : 0;
      previous.listenedMs += ms;
      maps[kind].set(key, previous);
    }
  }
  return {
    plays,
    listenedMs,
    events: selected.length,
    retention: "Most recent 10,000 local sessions",
    days,
    hours,
    weekdays,
    ...Object.fromEntries(
      Object.entries(maps).map(([key, value]) => [
        key,
        [...value.values()].sort(
          (a, b) => b.count - a.count || b.listenedMs - a.listenedMs,
        ),
      ]),
    ),
  };
}
export const playsCsv = (events) =>
  csv(events, [
    "uri",
    "title",
    "artist",
    "album",
    "startedAt",
    "listenedMs",
    "play",
  ]);
