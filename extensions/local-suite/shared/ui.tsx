import { likedInput } from "./liked-songs.mjs";
import React, { useEffect, useRef, useState } from "react";
import { SpotifyPlus as S } from "spotifyplus";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
} from "spotifyplus/react";
import { csv, spotifyUri, MAX_ITEMS } from "./model.mjs";
export const palette = {
  bg: "#101820",
  card: "#1b2732",
  text: "#f5f7fa",
  muted: "#b5c6d5",
  accent: "#a6f5ce",
};
export function Label({
  children,
  muted = false,
  large = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <Text
      style={{
        color: muted ? palette.muted : palette.text,
        fontSize: large ? 23 : 16,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  active = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: active ? "#294c40" : palette.card,
        borderRadius: 18,
        padding: 13,
        marginBottom: 8,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{ color: active ? palette.accent : palette.text, fontSize: 16 }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  secret?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Label muted>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        multiline={false}
        style={{
          color: palette.text,
          backgroundColor: palette.card,
          fontSize: 16,
          padding: 12,
          borderRadius: 10,
        }}
      />
    </View>
  );
}
export function Choices({
  items,
  value,
  onChange,
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {items.map(([id, label]) => (
        <Button
          key={id}
          title={label}
          active={value === id}
          onPress={() => onChange(id)}
        />
      ))}
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Button
      title={`${value ? "✓" : "○"} ${label}`}
      active={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
    />
  );
}
export function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const back = () => {
      S.Surfaces.close();
    };
    S.on("android.backPressed", back);
    return () => S.off("android.backPressed", back);
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <Label large>{title}</Label>
        <Button title="Close" onPress={() => S.Surfaces.close()} />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function useTask() {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const current = useRef<any>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (current.current) current.current.cancelled = true;
    };
  }, []);
  async function run(
    fn: (job: any, progress: (text: string) => void) => Promise<any>,
    done?: (value: any) => void,
  ) {
    if (current.current) return;
    const job = { cancelled: false };
    current.current = job;
    setBusy(true);
    setStatus("Working…");
    const progress = (text: string) => {
      if (mounted.current && !job.cancelled) setStatus(text);
    };
    try {
      const result = await fn(job, progress);
      if (mounted.current && !job.cancelled) {
        done?.(result);
        setStatus("Done.");
      }
    } catch (error) {
      if (mounted.current)
        setStatus(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      if (current.current === job) current.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    busy,
    status,
    setStatus,
    run,
    cancel: () => {
      if (current.current) {
        current.current.cancelled = true;
        setStatus("Stopping after the current request…");
      }
    },
  };
}
export function Status({ task }: { task: ReturnType<typeof useTask> }) {
  return (
    <View>
      {task.status ? <Label muted>{task.status}</Label> : null}
      {task.busy ? (
        <Button title="Stop after current request" onPress={task.cancel} />
      ) : null}
    </View>
  );
}
export function Results({ tracks }: { tracks: any[] }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [tracks]);
  const last = Math.max(0, Math.ceil(tracks.length / 40) - 1),
    index = Math.min(page, last);
  return (
    <View>
      <Label>{tracks.length} tracks in preview</Label>
      {tracks.slice(index * 40, (index + 1) * 40).map((t, i) => (
        <View
          key={`${t.uri}:${i}`}
          style={{
            padding: 12,
            backgroundColor: palette.card,
            borderRadius: 12,
            marginBottom: 6,
          }}
        >
          <Label>
            {index * 40 + i + 1}. {t.title}
          </Label>
          <Label muted>
            {t.artist}
            {t.album ? ` · ${t.album}` : ""}
          </Label>
          {t.metadataUnavailable ? (
            <Label muted>{t.metadataStatus || "Metadata unavailable"}. Saved URI retained: {t.uri}</Label>
          ) : null}
          {t.genreSource ? (
            <Label muted>
              {t.genres.length ? t.genres.join(" · ") : "Unknown genre"} —{" "}
              {t.genreSource}
            </Label>
          ) : null}
          <Button
            title="Open track in Spotify"
            onPress={() => S.Navigation.openSpotify(t.uri)}
          />
        </View>
      ))}
      {last > 0 ? (
        <View>
          <Label muted>
            Page {index + 1} of {last + 1}
          </Label>
          <Button
            title="Previous page"
            disabled={index === 0}
            onPress={() => setPage(index - 1)}
          />
          <Button
            title="Next page"
            disabled={index === last}
            onPress={() => setPage(index + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}
export function Actions({
  client,
  tracks,
  name,
  blocked = false,
}: {
  client: any;
  tracks: any[];
  name: string;
  blocked?: boolean;
}) {
  const task = useTask(),
    [copyName, setCopyName] = useState(`${name} · Plus`),
    [copyPart, setCopyPart] = useState(0),
    [confirmation, setConfirm] = useState<any>(null),
    [outcome, setResult] = useState<any>(null);
  const confirm = confirmation?.source === tracks ? confirmation : null;
  const result = outcome?.source === tracks ? outcome : null;
  const previous = S.Platform.Storage.get<any>("last-write-v1");
  const partCount = Math.max(1, Math.ceil(tracks.length / MAX_ITEMS)),
    part = Math.min(copyPart, partCount - 1),
    from = part * MAX_ITEMS,
    to = Math.min(tracks.length, from + MAX_ITEMS);
  function stage(action: string) {
    setConfirm({
      source: tracks,
      action,
      tracks: action !== "queue" ? tracks.slice(from, to) : [...tracks],
      name: action !== "queue" && partCount > 1
        ? `${copyName} · ${from + 1}-${to}` : copyName,
      token: `${Date.now()}:${Math.random()}`,
    });
  }
  function execute() {
    if (!confirm) return;
    const pending = confirm;
    setConfirm(null);
    task.run(
      (job, progress) =>
        pending.action === "native-copy"
          ? client.nativeCopy(pending.tracks, pending.name, pending.token, pending.token, job, progress)
          : pending.action === "copy"
          ? client.createCopy(
              pending.tracks,
              pending.name,
              pending.token,
              pending.token,
              job,
              progress,
            )
          : client.appendQueue(
              pending.tracks,
              pending.token,
              pending.token,
              job,
              progress,
            ),
      (value) => setResult({ ...value, source: tracks }),
    );
  }
  function exportData(json = false) {
    try {
      const value = json
        ? JSON.stringify(tracks, null, 2)
        : csv(tracks, [
            "uri",
            "title",
            "artist",
            "album",
            "releaseDate",
            "durationMs",
            "genreSource",
          ]);
      if (value.length > 1000000)
        throw new Error(
          "Export is too large for the Android clipboard; use a smaller preview.",
        );
      S.Platform.Clipboard.writeText(value);
      task.setStatus(
        json ? "JSON copied to clipboard." : "CSV copied to clipboard.",
      );
    } catch (e) {
      task.setStatus(e instanceof Error ? e.message : "Export failed.");
    }
  }
  return (
    <View>
      <Field
        label="Name for a new playlist copy"
        value={copyName}
        onChange={(value) => {
          setCopyName(value);
          setConfirm(null);
        }}
      />
      <Label muted>
        Saving creates a new playlist. Queue actions append to your existing
        queue. Neither action rewrites the source playlist.
      </Label>
      {partCount > 1 ? (
        <View>
          <Label muted>
            The full library is loaded. Each new playlist copy contains up to
            {" "}{MAX_ITEMS} tracks; choose the range to save.
          </Label>
          {Array.from({ length: partCount }, (_, index) => (
            <Button
              key={index}
              title={`Copy range ${index * MAX_ITEMS + 1}-${Math.min(tracks.length, (index + 1) * MAX_ITEMS)}`}
              active={part === index}
              disabled={task.busy || blocked}
              onPress={() => {
                setCopyPart(index);
                setConfirm(null);
                setResult(null);
              }}
            />
          ))}
        </View>
      ) : null}
      <Button
        title="Preview saving a new copy"
        disabled={blocked || task.busy || !tracks.length}
        onPress={() => stage("copy")}
      />
      <Button
        title="Preview native Spotify copy"
        disabled={blocked || task.busy || !tracks.length || (typeof client.api.Playlists?.create !== "function" || typeof client.api.Playlists?.addTracks !== "function")}
        onPress={() => stage("native-copy")}
      />
      <Label muted>
        Native copy uses Spotify’s own playlist service when Web API saves fail.
        It creates a separate playlist using Spotify’s default visibility; check
        its visibility in Spotify. Web API copy requests a private playlist.
      </Label>
      <Button
        title="Preview appending to queue (up to 100)"
        disabled={blocked || task.busy || !tracks.length || tracks.length > 100}
        onPress={() => stage("queue")}
      />
      {confirm ? (
        <View>
          <Label>
            {confirm.action === "queue"
              ? `Append ${confirm.tracks.length} tracks in preview order?`
              : `Create “${confirm.name}” with ${confirm.tracks.length} tracks?${confirm.action === "native-copy" ? " Native Spotify service; visibility follows Spotify defaults." : ""}`}
          </Label>
          <Button
            title="Confirm this action"
            disabled={task.busy || blocked}
            onPress={execute}
          />
          <Button
            title="Cancel confirmation"
            onPress={() => setConfirm(null)}
          />
        </View>
      ) : null}
      <Status task={task} />
      {result ? (
        <Label>
          Confirmed {result.completed} of {result.requested} tracks.
        </Label>
      ) : null}
      {result?.uri ? (
        <Button
          title="Open new playlist"
          onPress={() => S.Navigation.openSpotify(result.uri)}
        />
      ) : null}
      {previous && previous.phase !== "complete" ? (
        <View>
          <Label muted>
            Previous action: {previous.phase}; confirmed {previous.completed}/
            {previous.requested}. Inspect Spotify before repeating it.
          </Label>
          {previous.uri ? (
            <Button
              title="Inspect previous copy"
              onPress={() => S.Navigation.openSpotify(previous.uri)}
            />
          ) : null}
        </View>
      ) : null}
      <Button
        title="Copy preview as CSV"
        disabled={task.busy || !tracks.length}
        onPress={() => exportData()}
      />
      <Button
        title="Copy preview as JSON"
        disabled={task.busy || !tracks.length}
        onPress={() => exportData(true)}
      />
    </View>
  );
}
export function useGenreSettings() {
  const [key, setKey] = useState(
    () => S.Platform.Storage.get<string>("lastfm-key") || "",
  );
  const [musicbrainz, setMusicBrainz] = useState(
    () => S.Platform.Storage.get<boolean>("musicbrainz-enabled") === true,
  );
  return {
    key,
    setKey,
    musicbrainz,
    setMusicBrainz: (value: boolean) => {
      setMusicBrainz(value);
      S.Platform.Storage.set("musicbrainz-enabled", value);
    },
    save: () => S.Platform.Storage.set("lastfm-key", key.trim()),
    clear: () => {
      setKey("");
      S.Platform.Storage.remove("lastfm-key");
    },
  };
}
export function GenreSettings({
  settings,
}: {
  settings: ReturnType<typeof useGenreSettings>;
}) {
  return (
    <View>
      <Field
        label="Optional: your Last.fm API key (for tag fallback)"
        value={settings.key}
        onChange={settings.setKey}
        secret
      />
      <Label muted>
        Last.fm requests send the artist, album, or track name with your key.
        Keys are saved only in this extension’s private settings. Last.fm tags
        can include non-genre labels.
      </Label>
      <Toggle label="Use MusicBrainz fallback (no API key)" value={settings.musicbrainz} onChange={settings.setMusicBrainz} />
      <Label muted>
        MusicBrainz receives the artist name only when enabled. It supplies artist
        genres, not a classification of each song. Ambiguous names stay Unknown.
        Large libraries are slow; run one genre extension at a time.
      </Label>
      <Button title="Save key" onPress={settings.save} />
      <Button title="Remove saved key" onPress={settings.clear} />
    </View>
  );
}
export function currentContext() {
  try {
    return S.Player.getState()?.contextUri || "";
  } catch {
    return "";
  }
}
export function currentTrack() {
  try {
    return S.Player.getCurrentTrack()?.uri || "";
  } catch {
    return "";
  }
}
export function initialUri() {
  return S.Platform.Storage.get<string>("selected-uri") || currentContext();
}
export function register(
  title: string,
  Component: React.ComponentType,
  types?: ("track" | "album" | "artist" | "playlist")[],
) {
  new S.SideDrawer(title, () => React.createElement(Component)).register();
  if (types)
    new S.ContextMenu(
      `Select for ${title} (open in Extensions)`,
      (uri) => {
        S.Platform.Storage.set(
          "selected-uri",
          likedInput(uri) ? uri : spotifyUri(uri),
        );
      },
      undefined,
      false,
      types,
    ).register();
}

export function useLikedSource() {
  const [username, setUsername] = useState(
    () => S.Platform.Storage.get<string>("liked-username") || "",
  );
  return { username, setUsername };
}
export function LikedSongsSource({
  settings,
  onLoad,
  busy,
}: {
  settings: ReturnType<typeof useLikedSource>;
  onLoad: () => void;
  busy: boolean;
}) {
  const [options, setOptions] = useState(false);
  return (
    <View>
      <Button title="Load Liked Songs" disabled={busy} onPress={onLoad} />
      <Label muted>
        Reads your saved tracks directly. Sorting this preview keeps your likes
        unchanged.
      </Label>
      <Button
        title="Liked Songs account options"
        onPress={() => setOptions(!options)}
      />
      {options ? (
        <View>
          <Field
            label="Spotify username (only if automatic account lookup fails)"
            value={settings.username}
            onChange={settings.setUsername}
          />
          <Label muted>
            Use your Spotify account username, not your display name. Leave
            blank to detect the current account.
          </Label>
          <Button
            title="Save username option"
            onPress={() =>
              S.Platform.Storage.set("liked-username", settings.username.trim())
            }
          />
        </View>
      ) : null}
    </View>
  );
}
