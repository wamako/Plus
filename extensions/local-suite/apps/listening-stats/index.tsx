import React, { useEffect, useMemo, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { normalizeTrack, csv } from "../../shared/model.mjs";
import { ListeningTracker, aggregate, playsCsv } from "../../shared/stats.mjs";
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
} from "../../shared/ui";
const client = new DataClient(S);
const tracker = new ListeningTracker(
  S.Platform.Storage.get("listening-history-v1") || {},
);
let enabled = S.Platform.Storage.get<boolean>("tracking-enabled") === true;
let timer: ReturnType<typeof setInterval> | undefined,
  lastSave = 0,
  trackingError = "";
function save() {
  S.Platform.Storage.set("listening-history-v1", tracker.snapshot());
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
    [username, setUsername] = useState(
      () => S.Platform.Storage.get<string>("provider-user") || "",
    ),
    [key, setKey] = useState(
      () => S.Platform.Storage.get<string>("lastfm-key") || "",
    ),
    [remote, setRemote] = useState<any[] | null>(null),
    [tick, setTick] = useState(0),
    task = useTask();
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);
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
  const rows =
    provider === "local" ? (stats as any)[kind].slice(0, 50) : remote || [];
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
        onChange={(v) => update(() => setProvider(v))}
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
            value={username}
            onChange={(v) => update(() => setUsername(v))}
          />
          {provider === "lastfm" ? (
            <Field
              label="Your Last.fm API key"
              secret
              value={key}
              onChange={(v) => update(() => setKey(v))}
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
              S.Platform.Storage.set("provider-user", username.trim());
              S.Platform.Storage.set("lastfm-key", key.trim());
              task.setStatus("Provider settings saved.");
            }}
          />
          <Button
            title="Fetch rankings"
            disabled={task.busy}
            onPress={() =>
              task.run(
                () => client.top(provider, username, key, range, kind),
                setRemote,
              )
            }
          />
          <Button
            title="Remove saved provider settings"
            onPress={() => {
              S.Platform.Storage.remove("provider-user");
              S.Platform.Storage.remove("lastfm-key");
              setUsername("");
              setKey("");
              setRemote(null);
            }}
          />
        </View>
      )}
      <Status task={task} />
      <Label large>Top {kind}</Label>
      {rows.length ? (
        rows.map((row: any, i: number) => (
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
            </Label>
            {row.uri ? (
              <Button
                title="Open in Spotify"
                onPress={() => S.Navigation.openSpotify(row.uri)}
              />
            ) : null}
          </View>
        ))
      ) : (
        <Label muted>
          {provider === "local"
            ? "No recorded listening in this range yet. Enable tracking and play music."
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
