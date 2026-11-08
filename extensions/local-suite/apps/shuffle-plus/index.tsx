import React, { useRef, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { ShuffleClient, shuffleTracks, SHUFFLE_LIMIT } from "../../shared/shuffle.mjs";
import { LIKED_URI } from "../../shared/liked-songs.mjs";
import { Page, Label, Field, Button, Results, useTask, Status, initialUri, currentContext, register, useLikedSource, LikedSongsSource } from "../../shared/ui";
const dataClient = new DataClient(S), shuffleClient = new ShuffleClient(S);
function App() {
  const [uri, setUri] = useState(initialUri), input = useRef(uri),
    [data, setData] = useState<any>(null), [tracks, setTracks] = useState<any[]>([]),
    [part, setPart] = useState(0), [plan, setPlan] = useState<any>(null),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(0), [outcome, setOutcome] = useState(""), [runtime, setRuntime] = useState(""), task = useTask(), liked = useLikedSource();
  const count = Math.ceil(tracks.length / SHUFFLE_LIMIT), from = part * SHUFFLE_LIMIT,
    selected = data?.mode === "queue" ? tracks : tracks.slice(from, from + SHUFFLE_LIMIT),
    needsReview = shuffleClient.needsReview(),
    collectionReady = plan?.mode === "collection" && confirmation;
  function clear() { setPlan(null); setConfirmation(null); setOutcome(""); }
  function change(value: string) { input.current = value; setUri(value); clear(); setData(null); setTracks([]); setPart(0); }
  function load(value = input.current) {
    clear(); setData(null); setTracks([]); setPart(0);
    task.run(async (job, progress) => {
      await shuffleClient.capabilities(job);
      const source = await dataClient.collection(value, job, progress, { username: liked.savedUsername });
      return { ...source, mode: "collection" };
    }, value => { setData(value); setTracks(shuffleTracks(value.tracks)); });
  }
  function prepare() {
    clear();
    task.run((job, progress) => {
      progress("Preparing shuffled playback…");
      return shuffleClient.collection(selected, data.uri, job);
    }, value => {
      setPlan(value); setConfirmation(`${Date.now()}:${Math.random()}`);
    });
  }
  function apply() {
    if (!plan || !confirmation) return;
    const selectedPlan = plan, token = confirmation;
    clear();
    task.run((job, progress) => { progress("Applying through Spotify’s native player and checking the queue…"); return shuffleClient.apply(selectedPlan, token, token, job); }, value => {
      setOutcome(selectedPlan.mode === "queue" ? `Verified: ${value.applied} upcoming songs reordered. The playing song and history were kept.` : `Started the ${value.applied}-song selection. Its current song and visible selected songs match the preview.${value.autoplayTailCount ? ` ${value.autoplayTailCount} Spotify Autoplay recommendations follow the complete selection.` : ""}`);
    });
  }
  return <Page title="Shuffle+">
    <Label muted>Random song order without taste or artist weighting. Previewing never changes playback. Requires Spotify Plus R19.</Label>
    <Button title="Check active playback adapter" disabled={task.busy} onPress={() => task.run(job => shuffleClient.capabilities(job), info => setRuntime(`Active module R${info.host} · native PlayCommand · binding ${info.binding || "unknown"} · ${info.playerReady ? "player captured" : "start playback in Spotify first"}`))} />
    {runtime ? <Label>{runtime}</Label> : null}
    <Button title="Copy last shuffle diagnostics" disabled={task.busy} onPress={() => task.run(job => shuffleClient.copyDiagnostics(job), () => setRuntime("Shuffle diagnostics copied. They contain counts/status only; no song IDs, account names or tokens."))} />
    {shuffleClient.previous()?.diagnostics ? <Label muted>{JSON.stringify(shuffleClient.previous().diagnostics)}</Label> : null}
    <Button title="Preview shuffled upcoming queue" disabled={task.busy} onPress={() => {
      clear(); setData(null); setTracks([]); setPart(0);
      task.run(job => shuffleClient.queue(job), value => {
        setData({ mode: "queue" }); setTracks(value.tracks); setPlan(value); setConfirmation(`${Date.now()}:${Math.random()}`);
      });
    }} />
    <Label muted>Queue reshuffling keeps the playing song and previous songs. Turn Spotify's own shuffle off first.</Label>
    <LikedSongsSource settings={liked} busy={task.busy} onLoad={() => { change(LIKED_URI); load(LIKED_URI); }} />
    <Field label="Playlist or album link / URI" value={uri} onChange={change} />
    <Button title="Use current playing context" disabled={task.busy} onPress={() => change(currentContext())} />
    <Button title="Load and shuffle collection" disabled={task.busy} onPress={() => load()} />
    {tracks.length ? <View>
      <Label>{tracks.length} songs loaded. Duplicate occurrences are preserved.</Label>
      {data?.mode === "collection" ? <View>
        <Button title="Reshuffle preview" disabled={task.busy} onPress={() => { clear(); setTracks(shuffleTracks(tracks)); setPart(0); }} />
        {count > 1 ? <View><Label muted>The entire loaded collection was randomized. Choose an explicit playback range of up to 10,000 songs.</Label>
          {Array.from({ length: count }, (_, i) => <Button key={i} title={`Playback range ${i * SHUFFLE_LIMIT + 1}–${Math.min(tracks.length, (i + 1) * SHUFFLE_LIMIT)}`} active={part === i} disabled={task.busy} onPress={() => { setPart(i); clear(); }} />)}
        </View> : null}
        <Button title={collectionReady ? "Start shuffled playback" : "Prepare shuffled playback"} disabled={task.busy || needsReview} onPress={collectionReady ? apply : prepare} />
        {collectionReady ? <View>
          <Label>Ready to start this exact {plan.count}-song order. This confirmation expires after two minutes.</Label>
          <Button title="Cancel shuffle confirmation" disabled={task.busy} onPress={clear} />
        </View> : null}
        <Label muted>Prepare first, then tap Start shuffled playback in the same place. Starting plays the first previewed song in the selected order. Spotify may append Autoplay recommendations after the selection, following your Spotify preference. Your source collection is not edited.</Label>
      </View> : null}
    </View> : null}
    {plan?.mode === "queue" && confirmation ? <View>
      <Label>Reshuffle {plan.count} upcoming songs while keeping the playing song and history? This confirmation expires after two minutes.</Label>
      <Button title="Confirm upcoming shuffle" disabled={task.busy || needsReview} onPress={apply} />
      <Button title="Cancel shuffle confirmation" disabled={task.busy} onPress={clear} />
    </View> : null}
    {needsReview ? <View>
      <Label muted>The previous shuffle has an unconfirmed outcome. Check Spotify's player and queue before starting another.</Label>
      <Button title="I checked playback; allow another shuffle" disabled={task.busy} onPress={() => { shuffleClient.acknowledge(); clear(); setReviewed(reviewed + 1); }} />
    </View> : null}
    <Status task={task} />
    {outcome ? <Label>{outcome}</Label> : null}
    {tracks.length ? <Results tracks={selected} /> : null}
  </Page>;
}
register("Shuffle+", App, ["playlist", "album"]);
