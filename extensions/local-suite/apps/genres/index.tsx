import React, { useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { spotifyUri } from "../../shared/model.mjs";
import {
  Page,
  Label,
  Field,
  Button,
  useTask,
  Status,
  register,
  currentTrack,
  useGenreSettings,
  GenreSettings,
} from "../../shared/ui";
const client = new DataClient(S);
function App() {
  const [uri, setUri] = useState(
      () => S.Platform.Storage.get<string>("selected-uri") || currentTrack(),
    ),
    [track, setTrack] = useState<any>(null),
    [genre, setGenre] = useState(""),
    [details, setDetails] = useState<any>(null),
    task = useTask(),
    settings = useGenreSettings();
  function lookup(input = uri) {
    setDetails(null);
    setTrack(null);
    task.run(
      async (job) =>
        client.genres(
          await client.track(spotifyUri(input, "track"), job),
          { key: settings.key },
          job,
        ),
      setTrack,
    );
  }
  function detail(name: string) {
    setGenre(name);
    setDetails(null);
    task.run(() => client.genreInfo(name), setDetails);
  }
  function open(kind: string, id: string) {
    try {
      S.Navigation.openSpotify(spotifyUri(`spotify:${kind}:${id}`, kind));
    } catch {
      task.setStatus("This directory entry has an invalid Spotify identifier.");
    }
  }
  return (
    <Page title="What’s That Genre? · Android">
      <Label muted>
        Look up the current track’s artist genres, explore related genres, and
        open artists or playlists. This page leaves the native player and lyrics
        layout unchanged.
      </Label>
      <Field label="Spotify track link / URI" value={uri} onChange={setUri} />
      <Button
        title="Look up current track"
        disabled={task.busy}
        onPress={() => {
          const current = currentTrack();
          setUri(current);
          lookup(current);
        }}
      />
      <Button
        title="Look up entered track"
        disabled={task.busy}
        onPress={() => lookup()}
      />
      <GenreSettings settings={settings} />
      <Status task={task} />
      {track ? (
        <View>
          <Label large>{track.title}</Label>
          {track.genreStatus ? <Label muted>{track.genreStatus}</Label> : null}
          <Label>{track.artist}</Label>
          <Label muted>
            {track.genreSource}. Artist genres describe the artist’s catalog;
            Last.fm fallback labels describe user-submitted tags.
          </Label>
          {track.genres.length ? (
            track.genres.map((g: string) => (
              <Button
                key={g}
                title={`Explore ${g}`}
                disabled={task.busy}
                onPress={() => detail(g)}
              />
            ))
          ) : (
            <Label>
              No genre data is available for this track. You can try a Last.fm
              key for tag fallback.
            </Label>
          )}
        </View>
      ) : null}
      {details ? (
        <View>
          <Label large>{details.genresAdvancedInfo?.name || genre}</Label>
          <Label>
            {details.genresAdvancedInfo?.description ||
              "No description supplied by the genre directory."}
          </Label>
          <Label muted>Genre directory: LucasOe / What’s That Genre?</Label>
          <Label large>Related genres</Label>
          {(details.relatedGenres || []).slice(0, 24).map((g: any) => (
            <Button
              key={g.genre}
              title={g.genre}
              disabled={task.busy}
              onPress={() => detail(g.genre)}
            />
          ))}
          <Label large>Artists</Label>
          {(details.topArtists || []).slice(0, 20).map((a: any) => (
            <Button
              key={a.id}
              title={a.name || "Open artist"}
              onPress={() => open("artist", a.id)}
            />
          ))}
          <Label large>Genre playlists</Label>
          {(details.genresAdvancedInfo?.playlists || [])
            .slice(0, 12)
            .map((id: string, i: number) => (
              <Button
                key={id}
                title={`Open genre playlist ${i + 1}`}
                onPress={() => open("playlist", id)}
              />
            ))}
        </View>
      ) : null}
    </Page>
  );
}
register("What’s That Genre?", App, ["track"]);
