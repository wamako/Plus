import React, { useEffect, useMemo, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { normalizeTrack, csv } from "../../shared/model.mjs";
import { ListeningTracker, aggregate, playsCsv } from "../../shared/stats.mjs";
import { RatingsStore, StatsBridge } from "../../shared/suite-store.mjs";
import {
  Page,
  Label,
  Field,
  Button,
  Choices,
  Toggle,
  register,
  useTask,
  Status,
  palette,
  useTextSetting,
  TrackRatingRow,
} from "../../shared/ui";
const client = new DataClient(S);
const ratingsStore = new RatingsStore(S.Platform.Storage);
const statsBridge = new StatsBridge(S.Platform.Storage);
const tracker = new ListeningTracker(
  S.Platform.Storage.get("listening-history-v1") || {},
);
let enabled = S.Platform.Storage.get<boolean>("tracking-enabled") === true;
let timer: ReturnType<typeof setInterval> | undefined,
  lastSave = 0,
  trackingError = "";
try {
  statsBridge.syncFromEvents(tracker.data.events);
} catch {
  // Initial summary sync is best-effort.
}
function save() {
  S.Platform.Storage.set("listening-history-v1", tracker.snapshot());
  statsBridge.syncFromEvents(tracker.data.events);
  lastSave = Date.now();
}
function poll() {
  try {
    const state = S.Player.getState(),
      raw = S.Player.getCurrentTrack();
    // Transient missing metadata must not manufacture another play of the same track.
    if (!raw?.uri || raw.uri !== state.trackUri) return;
    tracker.sample(
      {
        track: normalizeTrack({ ...raw, explicit: undefined }),
        positionMs: state.positionMs,
        isPlaying: state.isPlaying,
        isPaused: state.isPaused,
        isBuffering: state.isBuffering,
      },
      Date.now(),
    );
    if (Date.now() - lastSave >= 10000) save();
    trackingError = "";
  } catch {
    trackingError =
      "Tracking paused by an unavailable player or storage bridge. No synthetic plays were added.";
    tracker.pause();
  }
}
function toggle(value: boolean) {
  S.Platform.Storage.set("tracking-enabled", value);
  enabled = value;
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  if (value) {
    poll();
    timer = setInterval(poll, 2000);
  } else {
    tracker.pause();
    save();
  }
}
if (enabled) toggle(true);
S.Events.on("trackSeeked", () => tracker.markSeek());
const minutes = (ms: number) => `${Math.round(ms / 60000)} min`;
function App() {
  const [active, setActive] = useState(enabled),
    [range, setRange] = useState("month"),
    [kind, setKind] = useState("tracks"),
    [provider, setProvider] = useState("local"),
    [remote, setRemote] = useState<any[] | null>(null),
    [tick, setTick] = useState(0),
    task = useTask();
  const userSetting = useTextSetting("provider-user", "Provider username", value => value && value.length <= 256 && !/[\x00-\x1f]/.test(value) ? "" : "Enter your public provider username."),
    keySetting = useTextSetting("lastfm-key", "Last.fm API key", value => !value || /^[0-9a-f]{32}$/i.test(value) ? "" : "Paste only your 32-character Last.fm API key, then save.");
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);
  const [ratingTick, setRatingTick] = useState(0);
  const stats = useMemo(
    () =>
      aggregate(tracker.data.events, {
        after:
          range === "all"
            ? 0
            : Date.now() - (range === "week" ? 7 : 30) * 86400000,
      }),
    [range, tick, active],
  );
  const forgottenRows = useMemo(
    () =>
      provider === "local" && kind === "forgotten"
        ? statsBridge.forgottenFavorites(30, Date.now(), ratingsStore).slice(0, 50)
        : [],
    [provider, kind, tick, active, ratingTick],
  );
  const rows =
    provider === "local"
      ? kind === "forgotten"
        ? forgottenRows
        : ((stats as any)[kind] || []).slice(0, 50)
      : remote || [];
  function exportData(json: boolean) {
    try {
      save();
      const text =
        provider === "local"
          ? json
            ? JSON.stringify(tracker.snapshot(), null, 2)
            : playsCsv(tracker.data.events)
          : json
            ? JSON.stringify(rows, null, 2)
            : csv(rows, ["title", "artist", "count", "listenedMs", "uri"]);
      if (text.length > 1000000)
        throw new Error(
          "Export exceeds the safe clipboard limit. The full local history remains saved privately.",
        );
      S.Platform.Clipboard.writeText(text);
      task.setStatus("Copied to clipboard.");
    } catch (e) {
      task.setStatus(e instanceof Error ? e.message : "Export failed.");
    }
  }
  function update(fn: () => void) {
    if (task.busy) task.cancel();
    setRemote(null);
    fn();
  }
  return (
    <Page title="Listening Stats · Android">
      <Label muted>
        Local tracking starts only when enabled below. Existing Spotify history
        is not imported. Statistics count time observed while this module is
        running; Spotify Connect, sleeping processes, and skipped sampling
        intervals may be missing.
      </Label>
      <Toggle
        label="Record listening locally"
        value={active}
        onChange={(value) => {
          try {
            toggle(value);
            setActive(value);
            setTick((n) => n + 1);
          } catch {
            task.setStatus("Could not update local tracking settings.");
          }
        }}
      />
      <Label muted>
        {trackingError ||
          "A play qualifies after 30 seconds, or 90% of a shorter track. Seeking is not listening time."}
      </Label>
      <Choices
        value={provider}
        onChange={(v) =>
          update(() => {
            setProvider(v);
            if (v !== "local" && kind === "forgotten") setKind("tracks");
          })
        }
        items={[
          ["local", "This device"],
          ["lastfm", "Last.fm"],
          ["statsfm", "Stats.fm"],
        ]}
      />
      <Choices
        value={range}
        onChange={(v) => update(() => setRange(v))}
        items={[
          ["week", "7 days"],
          ["month", "30 days / provider month"],
          ["all", "All retained history"],
        ]}
      />
      <Choices
        value={kind}
        onChange={(v) => update(() => setKind(v))}
        items={[
          ["tracks", "Top tracks"],
          ["artists", "Top artists"],
          ["albums", "Top albums"],
          ...(provider === "local"
            ? ([["forgotten", "Forgotten favorites (30d+)"]] as [string, string][])
            : []),
        ]}
      />
      {provider === "local" ? (
        <View>
          <Label large>
            {stats.plays} qualifying plays · {minutes(stats.listenedMs)}
          </Label>
          <Label muted>
            {stats.events} sessions in this view. Retains at most 10,000
            sessions. Artist totals use the primary artist label exposed by the
            host.
          </Label>
          <Label large>Daily listening · last 31 active days in range</Label>
          {Object.entries(stats.days)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-31)
            .map(([day, ms]) => (
              <View key={day} style={{ marginBottom: 8 }}>
                <Label muted>
                  {day} · {minutes(Number(ms))}
                </Label>
                <View
                  style={{
                    height: 8,
                    backgroundColor: palette.accent,
                    width: `${Math.max(1, (100 * Number(ms)) / Math.max(...Object.values(stats.days).map(Number), 1))}%`,
                    borderRadius: 4,
                  }}
                />
              </View>
            ))}
          <Label large>Day of week</Label>
          {stats.weekdays.map((ms: number, i: number) => (
            <Label key={i} muted>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]} ·{" "}
              {minutes(ms)}
            </Label>
          ))}
        </View>
      ) : (
        <View>
          <Field
            label={`Your public ${provider === "lastfm" ? "Last.fm" : "Stats.fm"} username`}
            value={userSetting.value}
            onChange={(v) => update(() => userSetting.change(v))}
          />
          {provider === "lastfm" ? (
            <Field
              label="Your Last.fm API key"
              secret
              value={keySetting.value}
              onChange={(v) => update(() => keySetting.change(v))}
            />
          ) : null}
          <Label muted>
            This request sends your entered username to the selected provider.
            Last.fm also receives your API key. Spotify credentials are never
            sent to these services. Providers may use calendar months or
            different time zones.
          </Label>
          <Button
            title="Save provider settings"
            onPress={() => {
              const userSaved = userSetting.save(), keySaved = keySetting.save();
              task.setStatus(userSaved && keySaved ? "Provider settings saved in this extension." : "Check the setting feedback below.");
            }}
          />
          {userSetting.status ? <Label muted>{userSetting.status}</Label> : null}
          {keySetting.status ? <Label muted>{keySetting.status}</Label> : null}
          <Button
            title="Fetch rankings"
            disabled={task.busy}
            onPress={() =>
              task.run(
                () => client.top(provider, userSetting.savedValue, keySetting.savedValue, range, kind),
                setRemote,
              )
            }
          />
          <Button
            title="Remove saved provider settings"
            onPress={() => {
              userSetting.clear();
              keySetting.clear();
              setRemote(null);
            }}
          />
        </View>
      )}
      <Status task={task} />
      <Label large>
        {kind === "forgotten" ? "Forgotten favorites (30+ days since last play)" : `Top ${kind}`}
      </Label>
      {rows.length ? (
        rows.map((row: any, i: number) => {
          const rating =
            row.rating ??
            (row.uri && /^spotify:track:/.test(row.uri)
              ? ratingsStore.get(row.uri)
              : null);
          return (
            <View
              key={`${row.uri || row.title}:${i}`}
              style={{
                padding: 12,
                marginBottom: 6,
                backgroundColor: palette.card,
                borderRadius: 10,
              }}
            >
              <Label>
                {i + 1}. {row.title}
              </Label>
              <Label muted>
                {row.artist}
                {row.artist ? " · " : ""}
                {row.count == null
                  ? "Play count not supplied"
                  : `${row.count} plays`}
                {row.listenedMs == null ? "" : ` · ${minutes(row.listenedMs)}`}
                {rating != null ? ` · ★ ${rating}/10` : ""}
                {row.daysAgo != null ? ` · ${row.daysAgo}d ago` : ""}
              </Label>
              {row.uri ? (
                <View>
                  <Button
                    title="Open in Spotify"
                    onPress={() => S.Navigation.openSpotify(row.uri)}
                  />
                  {kind === "forgotten" ? (
                    <Button
                      title="Queue track"
                      onPress={() => {
                        try {
                          S.Queue.add(row.uri);
                          task.setStatus(`Queued "${row.title}".`);
                        } catch {
                          task.setStatus("Could not queue track right now.");
                        }
                      }}
                    />
                  ) : null}
                  {provider === "local" && /^spotify:track:/.test(row.uri) ? (
                    <TrackRatingRow
                      uri={row.uri}
                      title={row.title}
                      artist={row.artist}
                      currentRating={rating}
                      onChange={() => setRatingTick((n) => n + 1)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <Label muted>
          {provider === "local"
            ? kind === "forgotten"
              ? "No forgotten favorites yet. Rate tracks 7★+ or build local play history over 30 days."
              : "No recorded listening in this range yet. Enable tracking and play music."
            : "Fetch a ranking to display results."}
        </Label>
      )}
      <Button
        title="Copy statistics as CSV"
        onPress={() => exportData(false)}
      />
      <Button
        title="Copy statistics as JSON"
        onPress={() => exportData(true)}
      />
      <Label muted>
        Exports use the Android clipboard. Local exports contain all retained
        sessions; remote exports contain the displayed top 50.
      </Label>
    </Page>
  );
}
register("Listening Stats", App);
