import { LIKED_URI } from "../../shared/liked-songs.mjs";
import React, { useMemo, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import {
  filterTracks,
  sortTracks,
  smartShuffle,
  trackMetric,
} from "../../shared/model.mjs";
import {
  Page,
  Label,
  Field,
  Button,
  Toggle,
  Choices,
  Results,
  Actions,
  useTask,
  Status,
  initialUri,
  currentContext,
  register,
  useLikedSource,
  LikedSongsSource,
} from "../../shared/ui";
const client = new DataClient(S);
function App() {
  const liked = useLikedSource();
  const [uri, setUri] = useState(initialUri),
    [data, setData] = useState<any>(null),
    [query, setQuery] = useState(""),
    [metric, setMetric] = useState("title"),
    [desc, setDesc] = useState(false),
    [dedupe, setDedupe] = useState(""),
    [one, setOne] = useState(false),
    [explicit, setExplicit] = useState(""),
    [shuffled, setShuffled] = useState<any[] | null>(null),
    task = useTask();
  const preview = useMemo(() => {
    if (!data) return [];
    const filtered = filterTracks(data.tracks, {
      query,
      dedupe,
      onePerArtist: one,
      explicit,
    });
    return sortTracks(filtered, metric, desc);
  }, [data, query, dedupe, one, explicit, metric, desc]);
  const tracks = shuffled || preview;
  function change(fn: () => void) {
    setShuffled(null);
    fn();
  }

  function load(input = uri) {
    setData(null);
    setShuffled(null);
    task.run(
      (job, progress) =>
        client.collection(input, job, progress, {
          username: liked.savedUsername,
        }),
      setData,
    );
  }
  return (
    <Page title="Sort Play · Android">
      <Label muted>
        Read a playlist or album, adjust its preview, then save a separate copy
        or append to the queue.
      </Label>
      <LikedSongsSource
        settings={liked}
        busy={task.busy}
        onLoad={() => {
          setUri(LIKED_URI);
          load(LIKED_URI);
        }}
      />
      <Field
        label="Spotify playlist, album, or track link / URI"
        value={uri}
        onChange={setUri}
      />
      <Button
        title="Use current playing context"
        disabled={task.busy}
        onPress={() => setUri(currentContext())}
      />
      <Button
        title="Load collection"
        disabled={task.busy}
        onPress={() => load()}
      />
      <Status task={task} />
      {data ? (
        <View>
          <Label large>{data.name}</Label>
          {data.tracks.some((track: any) => track.metadataUnavailable) ? (
            <Label muted>
              {
                data.tracks.filter((track: any) => track.metadataUnavailable)
                  .length
              }{" "}
              saved tracks have unavailable metadata; their URIs remain in the
              preview.
            </Label>
          ) : null}
          <Label muted>
            {data.source}. {data.skipped} non-track or unavailable metadata rows
            omitted.
          </Label>
          <Field
            label="Search within preview"
            value={query}
            onChange={(v) => change(() => setQuery(v))}
          />
          <Label>Sort by</Label>
          <Choices
            value={metric}
            onChange={(v) => change(() => setMetric(v))}
            items={[
              ["title", "Title"],
              ["artist", "Artist"],
              ["album", "Album"],
              ["release", "Release date"],
              ["added", "Date added"],
              ["duration", "Duration"],
              ["popularity", "Popularity (if available)"],
            ]}
          />
          <Toggle
            label="Descending order"
            value={desc}
            onChange={(v) => change(() => setDesc(v))}
          />
          <Label muted>
            {
              data.tracks.filter((t: any) => trackMetric(t, metric) == null)
                .length
            }{" "}
            tracks have no value for this sort. Unknown values stay at the end.
          </Label>
          <Choices
            value={dedupe}
            onChange={(v) => change(() => setDedupe(v))}
            items={[
              ["", "Keep duplicates"],
              ["uri", "Unique track URIs"],
              ["recording", "Unique ISRC recordings"],
            ]}
          />
          <Label muted>
            Recording deduplication uses ISRC when provided, otherwise the track
            URI.
          </Label>
          <Toggle
            label="One track per primary artist"
            value={one}
            onChange={(v) => change(() => setOne(v))}
          />
          <Choices
            value={explicit}
            onChange={(v) => change(() => setExplicit(v))}
            items={[
              ["", "Any content rating"],
              ["clean", "Known clean only"],
              ["explicit", "Known explicit only"],
            ]}
          />
          <Button
            title="Shuffle preview, separating artists where possible"
            onPress={() => setShuffled(smartShuffle(preview))}
          />
          <Button
            title="Restore sorted preview"
            onPress={() => setShuffled(null)}
          />
          <Actions
            key={data.uri}
            client={client}
            tracks={tracks}
            name={data.name}
            blocked={task.busy}
          />
          <Results tracks={tracks} />
        </View>
      ) : null}
    </Page>
  );
}
register("Sort Play", App, ["playlist", "album", "track"]);
