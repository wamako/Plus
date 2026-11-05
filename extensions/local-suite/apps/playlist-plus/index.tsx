import React, { useMemo, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import {
  filterTracks,
  genreCounts,
  smartShuffle,
} from "../../shared/model.mjs";
import {
  Page,
  Label,
  Field,
  Button,
  Choices,
  Results,
  Actions,
  useTask,
  Status,
  initialUri,
  currentContext,
  register,
  useGenreSettings,
  GenreSettings,
} from "../../shared/ui";
const client = new DataClient(S);
function App() {
  const [uri, setUri] = useState(initialUri),
    [genreQuery, setGenreQuery] = useState(""),
    [genreLimit, setGenreLimit] = useState(80),
    [data, setData] = useState<any>(null),
    [selected, setSelected] = useState<string[]>([]),
    [match, setMatch] = useState("any"),
    [preset, setPreset] = useState(""),
    [presets, setPresets] = useState<any>(
      () => S.Platform.Storage.get("genre-presets") || {},
    ),
    [shuffle, setShuffle] = useState<any[] | null>(null),
    task = useTask(),
    settings = useGenreSettings();
  const counts = useMemo(() => genreCounts(data?.tracks || []), [data]);
  const preview = useMemo(
    () =>
      data && selected.length
        ? filterTracks(data.tracks, { genres: selected, match })
        : [],
    [data, selected, match],
  );
  const tracks = shuffle || preview;
  function pick(name: string) {
    setSelected((old) =>
      old.includes(name) ? old.filter((g) => g !== name) : [...old, name],
    );
    setShuffle(null);
  }
  return (
    <Page title="Playlist Plus · Android">
      <Label muted>
        Filter a collection by genre. Select one or more tags, choose Any or
        All, and review the results. The original playlist stays intact.
      </Label>
      <Field
        label="Spotify collection link / URI"
        value={uri}
        onChange={setUri}
      />
      <Button
        title="Use current playing context"
        onPress={() => setUri(currentContext())}
      />
      <GenreSettings settings={settings} />
      <Button
        title="Load and classify genres"
        disabled={task.busy}
        onPress={() => {
          setData(null);
          setShuffle(null);
          task.run(async (job, progress) => {
            const collection = await client.collection(uri, job, progress);
            const tracks = await client.classify(
              collection.tracks,
              { key: settings.key, lastfmFirst: true },
              job,
              progress,
            );
            return { ...collection, tracks };
          }, setData);
        }}
      />
      <Status task={task} />
      {data ? (
        <View>
          <Label large>{data.name}</Label>
          <Label muted>
            {data.source}.{" "}
            {data.tracks.filter((t: any) => !t.genres.length).length} tracks
            have unknown genres. Unknown tracks cannot match genre filters.{" "}
            {data.skipped} non-track rows omitted.
          </Label>
          <Choices
            value={match}
            onChange={(v) => {
              setMatch(v);
              setShuffle(null);
            }}
            items={[
              ["any", "Match Any selected genre"],
              ["all", "Match All selected genres"],
            ]}
          />
          <Label>Selected: {selected.join(" · ") || "None"}</Label>
          <Field
            label="Find a genre"
            value={genreQuery}
            onChange={(v) => {
              setGenreQuery(v);
              setGenreLimit(80);
            }}
          />
          <Label>Genres</Label>
          {counts.length ? (
            counts
              .filter((g) => g.name.includes(genreQuery.toLowerCase().trim()))
              .slice(0, genreLimit)
              .map((g) => (
                <Button
                  key={g.name}
                  title={`${selected.includes(g.name) ? "✓ " : ""}${g.name} · ${g.count} (${g.percentage}%)`}
                  active={selected.includes(g.name)}
                  onPress={() => pick(g.name)}
                />
              ))
          ) : (
            <Label>
              No genre labels were returned. Try your own Last.fm key or another
              collection.
            </Label>
          )}
          {counts.filter((g) =>
            g.name.includes(genreQuery.toLowerCase().trim()),
          ).length > genreLimit ? (
            <Button
              title="Show more genres"
              onPress={() => setGenreLimit(genreLimit + 80)}
            />
          ) : null}
          <Button
            title="Clear selection"
            onPress={() => {
              setSelected([]);
              setShuffle(null);
            }}
          />
          <Field
            label="Name for a genre selection preset"
            value={preset}
            onChange={setPreset}
          />
          <Button
            title="Save this genre preset"
            disabled={!preset.trim() || !selected.length}
            onPress={() => {
              const next = {
                ...presets,
                [preset.trim().slice(0, 60)]: { genres: selected, match },
              };
              S.Platform.Storage.set("genre-presets", next);
              setPresets(next);
            }}
          />
          {Object.entries(presets).map(([name, value]: [string, any]) => (
            <View key={name}>
              <Button
                title={`Load preset: ${name}`}
                onPress={() => {
                  setSelected(value.genres);
                  setMatch(value.match);
                  setShuffle(null);
                }}
              />
              <Button
                title={`Delete preset: ${name}`}
                onPress={() => {
                  const next = { ...presets };
                  delete next[name];
                  S.Platform.Storage.set("genre-presets", next);
                  setPresets(next);
                }}
              />
            </View>
          ))}
          <Button
            title="Shuffle matching preview"
            disabled={!preview.length}
            onPress={() => setShuffle(smartShuffle(preview))}
          />
          <Button
            title="Restore playlist order"
            onPress={() => setShuffle(null)}
          />
          <Actions
            key={data.uri}
            client={client}
            tracks={tracks}
            name={`${data.name} · genres`}
            blocked={task.busy}
          />
          <Results tracks={tracks} />
        </View>
      ) : null}
    </Page>
  );
}
register("Playlist Plus", App, ["playlist", "album"]);
