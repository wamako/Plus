import { LIKED_URI } from "../../shared/liked-songs.mjs";
import React, { useMemo, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import {
  filterTracks,
  findDuplicates,
  sortTracks,
  smartShuffle,
  trackMetric,
} from "../../shared/model.mjs";
import { RatingsStore, StatsBridge } from "../../shared/suite-store.mjs";
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
const ratingsStore = new RatingsStore(S.Platform.Storage);
const statsBridge = new StatsBridge(S.Platform.Storage);
function App() {
  const liked = useLikedSource();
  const [uri, setUri] = useState(initialUri),
    [data, setData] = useState<any>(null),
    [query, setQuery] = useState(""),
    [metric, setMetric] = useState("title"),
    [desc, setDesc] = useState(false),
    [dedupe, setDedupe] = useState(""),
    [showDupes, setShowDupes] = useState(false),
    [one, setOne] = useState(false),
    [explicit, setExplicit] = useState(""),
    [minRating, setMinRating] = useState(""),
    [forgotten, setForgotten] = useState(false),
    [ratingTick, setRatingTick] = useState(0),
    [shuffled, setShuffled] = useState<any[] | null>(null),
    task = useTask();
  const hydratedTracks = useMemo(
    () => (data ? statsBridge.hydrateTracks(data.tracks, ratingsStore) : []),
    [data, ratingTick],
  );
  const preview = useMemo(() => {
    if (!data) return [];
    const filtered = filterTracks(hydratedTracks, {
      query,
      dedupe,
      onePerArtist: one,
      explicit,
      minRating: minRating ? Number(minRating) : null,
      forgottenDays: forgotten ? 30 : null,
    });
    return sortTracks(filtered, metric, desc);
  }, [data, hydratedTracks, query, dedupe, one, explicit, minRating, forgotten, metric, desc]);
  const dupes = useMemo(
    () => (showDupes && dedupe ? findDuplicates(hydratedTracks, dedupe) : []),
    [hydratedTracks, showDupes, dedupe],
  );
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
              ["rating", "Rating (1–10★)"],
              ["playCount", "Local play count"],
              ["lastPlayed", "Last played date"],
            ]}
          />
          <Toggle
            label="Descending order"
            value={desc}
            onChange={(v) => change(() => setDesc(v))}
          />
          <Label muted>
            {
              hydratedTracks.filter((t: any) => trackMetric(t, metric) == null)
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
              ["title-artist", "Unique title + artist (remasters/deluxe)"],
            ]}
          />
          <Label muted>
            Recording uses ISRC when provided; Title + Artist catches remasters
            and deluxe re-releases.
          </Label>
          {dedupe ? (
            <Toggle
              label="Preview detected duplicates"
              value={showDupes}
              onChange={setShowDupes}
            />
          ) : null}
          {showDupes && dedupe ? (
            <View>
              <Label muted>
                {dupes.length
                  ? `${dupes.length} duplicate(s) removed by "${dedupe}" mode (showing up to 30):`
                  : "No duplicates detected for the selected mode."}
              </Label>
              {dupes.slice(0, 30).map((d: any, i: number) => (
                <Label key={`${d.duplicate.uri}:${i}`} muted>
                  • {d.duplicate.title} — {d.duplicate.artist} (matches{" "}
                  {d.kept.title})
                </Label>
              ))}
            </View>
          ) : null}
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
          <Label>Rating & Forgotten filters</Label>
          <Choices
            value={minRating}
            onChange={(v) => change(() => setMinRating(v))}
            items={[
              ["", "Any personal rating"],
              ["7", "Rated 7★+"],
              ["8", "Rated 8★+"],
              ["9", "Rated 9–10★"],
              ["-1", "Unrated only"],
            ]}
          />
          <Toggle
            label="Forgotten favorites only (30d+ unplayed)"
            value={forgotten}
            onChange={(v) => change(() => setForgotten(v))}
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
          <Results tracks={tracks} onRate={() => setRatingTick((n) => n + 1)} />
        </View>
      ) : null}
    </Page>
  );
}
register("Sort Play", App, ["playlist", "album", "track"]);
