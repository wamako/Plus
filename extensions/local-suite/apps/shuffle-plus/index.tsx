import { HOST } from "../../shared/build-info.mjs";
import React, { useRef, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { ShuffleClient, shuffleTracks, playbackRange, SHUFFLE_LIMIT } from "../../shared/shuffle.mjs";
import { smartShuffle, weightedForgottenShuffle } from "../../shared/model.mjs";
import { RatingsStore, StatsBridge } from "../../shared/suite-store.mjs";
import { LIKED_URI } from "../../shared/liked-songs.mjs";
import { Page, Label, Field, Button, Choices, Results, useTask, Status, initialUri, currentContext, register, useLikedSource, LikedSongsSource } from "../../shared/ui";
const dataClient = new DataClient(S), shuffleClient = new ShuffleClient(S);
const ratingsStore = new RatingsStore(S.Platform.Storage), statsBridge = new StatsBridge(S.Platform.Storage);
function orderTracks(list: any[], mode: string) {
  if (mode === "artist") return smartShuffle(list);
  if (mode === "forgotten") return weightedForgottenShuffle(statsBridge.hydrateTracks(list, ratingsStore));
  return shuffleTracks(list);
}
function App() {
  const [uri, setUri] = useState(initialUri), input = useRef(uri),
    [data, setData] = useState<any>(null), [tracks, setTracks] = useState<any[]>([]),
    [shuffleMode, setShuffleMode] = useState("fisher"),
    [part, setPart] = useState(0), [rangeSize, setRangeSize] = useState(SHUFFLE_LIMIT), [plan, setPlan] = useState<any>(null),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(0), [outcome, setOutcome] = useState(""), [runtime, setRuntime] = useState(""), task = useTask(), liked = useLikedSource();
  const range = playbackRange(tracks.length, rangeSize, part),
    selected = data?.mode === "queue" ? tracks : tracks.slice(range.from, range.to),
    needsReview = shuffleClient.needsReview(),
    collectionReady = plan?.mode === "collection" && confirmation;
  function clear() { setPlan(null); setConfirmation(null); setOutcome(""); }
  function change(value: string) { input.current = value; setUri(value); clear(); setData(null); setTracks([]); setPart(0); }
  function load(value = input.current, mode = shuffleMode) {
    clear(); setData(null); setTracks([]); setPart(0);
    task.run(async (job, progress) => {
      await shuffleClient.capabilities(job);
      const source = await dataClient.collection(value, job, progress, { username: liked.savedUsername });
      return { ...source, mode: "collection" };
    }, value => { setData(value); setTracks(orderTracks(value.tracks, mode)); });
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
    <Label muted>Random song order without taste or artist weighting. Previewing never changes playback. Requires Spotify Plus R{HOST}.</Label>
    <Button title="Check active playback adapter" disabled={task.busy} onPress={() => task.run(job => shuffleClient.capabilities(job), info => setRuntime(`Active module R${info.host} · native Play + explicit queue · binding ${info.binding || "unknown"} · ${info.playerReady ? "player captured" : "start playback in Spotify first"}`))} />
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
    <Choices value={shuffleMode} onChange={(mode) => { setShuffleMode(mode); if (data?.mode === "collection" && tracks.length) { clear(); setTracks(orderTracks(tracks, mode)); setPart(0); } }} items={[["fisher", "Pure Fisher-Yates (Default)"], ["artist", "Artist-Separated"], ["forgotten", "Forgotten Favorites Weighted"]]} />
    <Button title="Load and shuffle collection" disabled={task.busy} onPress={() => load()} />
    {tracks.length ? <View>
      <Label>{tracks.length} songs loaded. Duplicate occurrences are preserved.</Label>
      {data?.mode === "collection" ? <View>
        <Button title="Reshuffle preview" disabled={task.busy} onPress={() => { clear(); setTracks(orderTracks(tracks, shuffleMode)); setPart(0); }} />
        <Label muted>{`Selected playback range ${range.from + 1}–${range.to} of ${tracks.length}. Only these ${selected.length} previewed songs will be requested.`}</Label>
        <Button title="Use 20-song test ranges" active={rangeSize === 20} disabled={task.busy} onPress={() => { setRangeSize(20); setPart(0); clear(); }} />
        <Button title="Use up to 10,000-song ranges" active={rangeSize === SHUFFLE_LIMIT} disabled={task.busy} onPress={() => { setRangeSize(SHUFFLE_LIMIT); setPart(0); clear(); }} />
        {range.count > 1 ? <View>
          <Button title="Previous playback range" disabled={task.busy || range.part === 0} onPress={() => { setPart(range.part - 1); clear(); }} />
          <Button title="Next playback range" disabled={task.busy || range.part + 1 >= range.count} onPress={() => { setPart(range.part + 1); clear(); }} />
        </View> : null}
        {selected.some(t => t.metadataUnavailable) ? <Label muted>{selected.filter(t => t.metadataUnavailable).length} selected songs have missing metadata. Their saved URIs are retained; missing metadata does not prove that a song is unplayable. Metadata network failures and queue-order confirmation are separate checks.</Label> : null}
        <Button title={collectionReady ? "Start shuffled playback" : "Prepare shuffled playback"} disabled={task.busy || needsReview} onPress={collectionReady ? apply : prepare} />
        {collectionReady ? <View>
          <Label>Ready to start the first song, then explicitly queue the remaining {plan.count - 1} songs. Spotify shuffle and repeat will be off for this playback. This confirmation expires after two minutes.</Label>
          <Button title="Cancel shuffle confirmation" disabled={task.busy} onPress={clear} />
        </View> : null}
        <Label muted>Prepare first, then tap Start shuffled playback in the same place. Starting plays the first previewed song, then installs the remaining preview as queued songs. If the second step fails, the first song may still be playing; inspect the queue before another attempt. Manually queued songs must be cleared first. Spotify may append Autoplay recommendations after the selection, following your Spotify preference. Your source collection is not edited.</Label>
      </View> : null}
    </View> : null}
    {plan?.mode === "queue" && confirmation ? <View>
      <Label>Reshuffle {plan.count} upcoming songs while keeping the playing song and history? This confirmation expires after two minutes.</Label>
      <Button title="Confirm upcoming shuffle" disabled={task.busy || needsReview} onPress={apply} />
      <Button title="Cancel shuffle confirmation" disabled={task.busy} onPress={clear} />
    </View> : null}
    {needsReview ? <View>
      <Label muted>The previous shuffle has an unconfirmed outcome. Check Spotify's player and queue before starting another.</Label>
      <Button title="I checked playback; allow another shuffle" disabled={task.busy} onPress={() => task.run(async () => { shuffleClient.acknowledge(); }, () => { clear(); setReviewed(reviewed + 1); })} />
    </View> : null}
    <Status task={task} />
    {outcome ? <Label>{outcome}</Label> : null}
    {tracks.length ? <Results tracks={selected} /> : null}
  </Page>;
}
register("Shuffle+", App, ["playlist", "album"]);
