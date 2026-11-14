import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { DataClient } from "../../shared/data.mjs";
import { formatDuration, spotifyUri } from "../../shared/model.mjs";
import {
  RatingsStore,
  BookmarksStore,
} from "../../shared/suite-store.mjs";
import {
  computeQueueSummary,
  resolveMissingQueueDurations,
  evaluateAbLoop,
  evaluateOutroSkip,
} from "../../shared/queue-time.mjs";
import { findPlaylistsContainingTrack } from "../../shared/playlist-index.mjs";
import {
  Page,
  Label,
  Field,
  Button,
  Toggle,
  Status,
  useTask,
  palette,
  register,
  TrackRatingRow,
} from "../../shared/ui";
import { Phase3Panel } from "../../shared/phase3-panel";
import { initPhase3Runtime } from "../../shared/phase3-overlay";

const client = new DataClient(S);
initPhase3Runtime(client);
const ratingsStore = new RatingsStore(S.Platform.Storage);
const bookmarksStore = new BookmarksStore(S.Platform.Storage);

let outroEnabled = S.Platform.Storage.get<boolean>("outro-skip-enabled") === true;
let outroTimer: ReturnType<typeof setInterval> | undefined;
const outroRuntime: {
  enabled: boolean;
  outroMs: number | null;
  suppressUntilMs: number;
  lastTriggeredUri: string;
  lastTriggeredAt: number;
} = {
  enabled: outroEnabled,
  outroMs: null,
  suppressUntilMs: 0,
  lastTriggeredUri: "",
  lastTriggeredAt: 0,
};

function pollOutroSkip() {
  if (!outroRuntime.enabled) return;
  try {
    const state = S.Player.getState();
    const uri = state?.trackUri || "";
    if (!uri) return;
    outroRuntime.outroMs = bookmarksStore.getOutro(uri);
    const decision = evaluateOutroSkip(
      outroRuntime,
      uri,
      S.Player.getProgress(),
      Boolean(state?.isPlaying),
      Date.now(),
    );
    if (decision.action === "skip-next") {
      outroRuntime.lastTriggeredUri = uri;
      outroRuntime.lastTriggeredAt = Date.now();
      S.Player.skipNext();
    }
  } catch {
    // Background outro watcher must tolerate transient host unavailability.
  }
}

function setOutroWatcher(value: boolean) {
  S.Platform.Storage.set("outro-skip-enabled", value);
  outroEnabled = value;
  outroRuntime.enabled = value;
  if (outroTimer) {
    clearInterval(outroTimer);
    outroTimer = undefined;
  }
  if (value) {
    outroTimer = setInterval(pollOutroSkip, 900);
  }
}

if (outroEnabled) setOutroWatcher(true);
S.Events.on("songChanged", () => {
  outroRuntime.lastTriggeredUri = "";
  outroRuntime.suppressUntilMs = 0;
});
S.Events.on("trackSeeked", () => {
  outroRuntime.suppressUntilMs = Date.now() + 3000;
});

function safeRead<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function readPlayerSnapshot() {
  const state = safeRead(() => S.Player.getState(), null);
  const current = safeRead(() => S.Player.getCurrentTrack(), null);
  const rawPos = safeRead(() => S.Player.getProgress(), -1);
  const pos =
    typeof rawPos === "number" && Number.isFinite(rawPos) && rawPos >= 0
      ? rawPos
      : Math.max(0, Number((state as any)?.positionMs) || 0);
  const apiAny = S as any;
  const upNext = safeRead(
    () => (apiAny.UpNext?.get ? apiAny.UpNext.get() : S.Queue.get()),
    null,
  );
  return { state, current, pos, upNext };
}

function App() {
  const [selectedUri, setSelectedUri] = useState(
    () => S.Platform.Storage.get<string>("selected-uri") || "",
  );
  const [snap, setSnap] = useState(() => readPlayerSnapshot());
  const [extraDurations, setExtraDurations] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [note, setNote] = useState("");
  const [showAllBookmarks, setShowAllBookmarks] = useState(false);
  const [bookmarkTick, setBookmarkTick] = useState(0);
  const [ratingTick, setRatingTick] = useState(0);
  const [outroActive, setOutroActive] = useState(outroEnabled);
  const [outroStatus, setOutroStatus] = useState("");
  const [loopState, setLoopState] = useState<{
    trackUri: string;
    loopA: number | null;
    loopB: number | null;
    enabled: boolean;
  }>({ trackUri: "", loopA: null, loopB: null, enabled: false });
  const [playlistMatches, setPlaylistMatches] = useState<{
    uri: string;
    scannedPlaylists: number;
    fromCache: boolean;
    matches: any[];
  } | null>(null);
  const [resolvedTrack, setResolvedTrack] = useState<any>(null);
  const queueTask = useTask();
  const playlistTask = useTask();
  const loopRef = useRef(loopState);
  loopRef.current = loopState;

  function refreshSnapshot() {
    setSnap(readPlayerSnapshot());
  }

  useEffect(() => {
    refreshSnapshot();
    const onSongChanged = (ev: any) => {
      if (loopRef.current.enabled && ev?.uri && ev.uri !== loopRef.current.trackUri) {
        setLoopState((prev) => ({ ...prev, enabled: false }));
      }
      refreshSnapshot();
    };
    S.Events.on("songChanged", onSongChanged);
    S.Events.on("upNextChanged", refreshSnapshot);
    S.Events.on("playPause", refreshSnapshot);
    S.Events.on("trackSeeked", refreshSnapshot);
    const id = setInterval(refreshSnapshot, 2500);
    return () => {
      S.Events.off("songChanged", onSongChanged);
      S.Events.off("upNextChanged", refreshSnapshot);
      S.Events.off("playPause", refreshSnapshot);
      S.Events.off("trackSeeked", refreshSnapshot);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!loopState.enabled || loopState.loopA == null || loopState.loopB == null) return;
    const id = setInterval(() => {
      try {
        const state = S.Player.getState();
        const decision = evaluateAbLoop(
          loopRef.current,
          state?.trackUri || "",
          S.Player.getProgress(),
          Boolean(state?.isPlaying),
        );
        if (decision.action === "seek" && typeof decision.positionMs === "number") {
          S.Player.seek(decision.positionMs);
        }
      } catch {
        // Ignore transient player polling failures while A-B loop runs.
      }
    }, 450);
    return () => clearInterval(id);
  }, [loopState.enabled, loopState.loopA, loopState.loopB, loopState.trackUri]);

  const currentTrack = snap.current || snap.upNext?.current || null;
  const currentUri = snap.state?.trackUri || currentTrack?.uri || "";
  const activeUri = selectedUri || currentUri;

  useEffect(() => {
    let cancelled = false;
    if (!activeUri || (activeUri === currentUri && currentTrack?.title)) {
      setResolvedTrack(null);
      return;
    }
    client
      .track(activeUri)
      .then((item) => {
        if (!cancelled) setResolvedTrack(item);
      })
      .catch(() => {
        if (!cancelled) setResolvedTrack(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeUri, currentUri, currentTrack?.title]);

  const targetTrack = useMemo(() => {
    if (
      activeUri &&
      resolvedTrack?.uri === activeUri &&
      (activeUri !== currentUri || !currentTrack?.title)
    ) {
      return resolvedTrack;
    }
    if (currentTrack?.uri && (!activeUri || currentTrack.uri === activeUri)) {
      return {
        uri: currentTrack.uri,
        title: currentTrack.title || currentTrack.uri,
        artist: currentTrack.artist || (currentTrack.artists || []).join(", "),
        durationMs: currentTrack.durationMs || 0,
        isrc: "",
      };
    }
    return activeUri
      ? { uri: activeUri, title: activeUri, artist: "", durationMs: 0, isrc: "" }
      : null;
  }, [activeUri, currentUri, currentTrack, resolvedTrack]);

  const queueSummary = useMemo(
    () =>
      computeQueueSummary({
        upNext: snap.upNext,
        playerState: snap.state ? { ...snap.state, positionMs: snap.pos } : null,
        currentTrack: currentTrack?.uri
          ? {
              uri: currentTrack.uri,
              durationMs: currentTrack.durationMs || resolvedTrack?.durationMs || 0,
            }
          : resolvedTrack?.uri === currentUri
            ? { uri: resolvedTrack.uri, durationMs: resolvedTrack.durationMs || 0 }
            : null,
        extraDurations,
        nowMs: Date.now(),
      }),
    [snap, currentTrack, currentUri, resolvedTrack, extraDurations],
  );

  const trackBookmarks = useMemo(
    () => (activeUri ? bookmarksStore.forTrack(activeUri) : []),
    [activeUri, bookmarkTick],
  );
  const allBookmarks = useMemo(
    () => (showAllBookmarks ? bookmarksStore.all() : []),
    [showAllBookmarks, bookmarkTick],
  );
  const currentRating = useMemo(
    () => (activeUri ? ratingsStore.get(activeUri) : null),
    [activeUri, ratingTick],
  );
  const outroMs = useMemo(
    () => (activeUri ? bookmarksStore.getOutro(activeUri) : null),
    [activeUri, bookmarkTick],
  );

  function saveBookmark() {
    if (!targetTrack?.uri || !/^spotify:track:/.test(targetTrack.uri)) {
      queueTask.setStatus("Start or select a track first to save a bookmark.");
      return;
    }
    const pos = targetTrack.uri === currentUri ? Math.max(0, Number(snap.pos) || 0) : 0;
    bookmarksStore.add({
      uri: targetTrack.uri,
      title: targetTrack.title,
      artist: targetTrack.artist,
      positionMs: pos,
      note,
    });
    setNote("");
    setBookmarkTick((n) => n + 1);
    queueTask.setStatus(`Saved bookmark at ${formatDuration(pos)}.`);
  }

  function saveOutro(ms: number) {
    if (!targetTrack?.uri || !/^spotify:track:/.test(targetTrack.uri)) return;
    try {
      const clamped = Math.max(5000, Math.floor(ms));
      bookmarksStore.setOutro(targetTrack.uri, clamped, {
        title: targetTrack.title,
        artist: targetTrack.artist,
      });
      setOutroStatus(`Outro auto-skip set at ${formatDuration(clamped)}.`);
      setBookmarkTick((n) => n + 1);
    } catch (e: any) {
      setOutroStatus(e?.message || "Could not save outro timestamp.");
    }
  }

  function scanPlaylists(forceRefresh: boolean) {
    if (!targetTrack?.uri) {
      playlistTask.setStatus("No track selected.");
      return;
    }
    playlistTask.run(
      (job, progress) =>
        findPlaylistsContainingTrack(client, targetTrack, {
          forceRefresh,
          job,
          progress,
        }),
      (res) => setPlaylistMatches({ uri: targetTrack.uri, ...res }),
    );
  }

  const posNow = Math.max(0, Number(snap.pos) || 0);
  const isPlayingTarget = Boolean(targetTrack?.uri && targetTrack.uri === currentUri);

  return (
    <Page title="Queue & Bookmarks+">
      <Label muted>
        Live queue remaining time, timestamped bookmarks, A–B section looping,
        outro auto-skip, track ratings, and playlist reverse-lookup.
      </Label>

      <Label large>Queue Remaining Time</Label>
      {queueSummary.totalCount > 0 ? (
        <View>
          <Label>
            {queueSummary.formattedRemaining} remaining · Ends around{" "}
            {queueSummary.formattedEndsAt}
          </Label>
          <Label muted>
            {queueSummary.totalCount} tracks ({queueSummary.knownCount} with known
            duration
            {queueSummary.missingDurationCount > 0
              ? `, ${queueSummary.missingDurationCount} missing`
              : ""}
            ). Position: {formatDuration(posNow)}.
          </Label>
        </View>
      ) : (
        <Label muted>Start playback in Spotify to inspect the active queue.</Label>
      )}
      <Button
        title="Refresh queue summary"
        disabled={queueTask.busy}
        onPress={refreshSnapshot}
      />
      {queueSummary.missingDurationCount > 0 ? (
        <Button
          title="Resolve missing queue durations"
          disabled={queueTask.busy}
          onPress={() =>
            queueTask.run(
              async (job, progress) => {
                progress("Fetching missing track durations for queue…");
                const entries = [
                  ...(snap.upNext?.current ? [snap.upNext.current] : []),
                  ...(snap.upNext?.next || []),
                ];
                return resolveMissingQueueDurations(entries, client, 60, job);
              },
              (resolved) => {
                setExtraDurations((prev) => {
                  const next = new Map(prev);
                  for (const [k, v] of resolved.entries()) next.set(k, v);
                  return next;
                });
              },
            )
          }
        />
      ) : null}
      <Status task={queueTask} />

      <Label large>Selected Track & Rating</Label>
      {targetTrack ? (
        <View
          style={{
            padding: 12,
            backgroundColor: palette.card,
            borderRadius: 12,
            marginBottom: 8,
          }}
        >
          <Label>{targetTrack.title}</Label>
          <Label muted>
            {targetTrack.artist || targetTrack.uri}
            {isPlayingTarget ? ` · Playing (${formatDuration(posNow)})` : " · Selected"}
          </Label>
          {selectedUri && currentUri && selectedUri !== currentUri ? (
            <Button
              title="Switch to currently playing track"
              onPress={() => {
                S.Platform.Storage.remove("selected-uri");
                setSelectedUri("");
              }}
            />
          ) : null}
          {/^spotify:track:/.test(targetTrack.uri) ? (
            <TrackRatingRow
              uri={targetTrack.uri}
              title={targetTrack.title}
              artist={targetTrack.artist}
              currentRating={currentRating}
              onChange={() => setRatingTick((n) => n + 1)}
            />
          ) : null}
        </View>
      ) : (
        <Label muted>No active or selected track.</Label>
      )}

      <Label large>Timestamped Bookmarks</Label>
      <Field label="Bookmark note (optional)" value={note} onChange={setNote} />
      <Button title="Save bookmark at current position" onPress={saveBookmark} />
      {trackBookmarks.length ? (
        trackBookmarks.map((bm: any) => (
          <View
            key={bm.id}
            style={{
              padding: 10,
              backgroundColor: palette.card,
              borderRadius: 10,
              marginBottom: 6,
            }}
          >
            <Label>
              {formatDuration(bm.positionMs)}
              {bm.note ? ` · ${bm.note}` : ""}
            </Label>
            <Label muted>{bm.title}</Label>
            <Button
              title={bm.uri === currentUri ? "Jump to bookmark" : "Open track in Spotify"}
              onPress={() => {
                if (bm.uri === currentUri) S.Player.seek(bm.positionMs);
                else S.Navigation.openSpotify(spotifyUri(bm.uri));
              }}
            />
            <Button
              title="Delete bookmark"
              onPress={() => {
                bookmarksStore.remove(bm.id);
                setBookmarkTick((n) => n + 1);
              }}
            />
          </View>
        ))
      ) : (
        <Label muted>No bookmarks saved for this track yet.</Label>
      )}
      <Toggle
        label="Show all saved bookmarks across tracks"
        value={showAllBookmarks}
        onChange={setShowAllBookmarks}
      />
      {showAllBookmarks ? (
        allBookmarks.length ? (
          allBookmarks.slice(0, 40).map((bm: any) => (
            <View key={`all:${bm.id}`} style={{ marginBottom: 4 }}>
              <Button
                title={`${bm.title} @ ${formatDuration(bm.positionMs)}${bm.note ? ` (${bm.note})` : ""}`}
                onPress={() => {
                  if (bm.uri === currentUri) S.Player.seek(bm.positionMs);
                  else {
                    S.Platform.Storage.set("selected-uri", bm.uri);
                    setSelectedUri(bm.uri);
                    S.Navigation.openSpotify(bm.uri);
                  }
                }}
              />
            </View>
          ))
        ) : (
          <Label muted>No bookmarks saved yet.</Label>
        )
      ) : null}

      <Label large>A–B Section Loop</Label>
      <Label muted>
        Loops playback cleanly between A and B for practicing or replaying
        sections. Disables automatically on track change.
      </Label>
      <Label>
        A: {loopState.loopA != null ? formatDuration(loopState.loopA) : "unset"} · B:{" "}
        {loopState.loopB != null ? formatDuration(loopState.loopB) : "unset"}
      </Label>
      <Button
        title="Set A at current time"
        disabled={!isPlayingTarget}
        onPress={() =>
          setLoopState((prev) => ({
            ...prev,
            trackUri: currentUri,
            loopA: Math.max(0, S.Player.getProgress()),
          }))
        }
      />
      <Button
        title="Set B at current time"
        disabled={!isPlayingTarget}
        onPress={() =>
          setLoopState((prev) => ({
            ...prev,
            trackUri: currentUri,
            loopB: Math.max(0, S.Player.getProgress()),
          }))
        }
      />
      <Toggle
        label="Enable A–B loop"
        value={loopState.enabled}
        onChange={(value) => {
          if (value && (loopState.loopA == null || loopState.loopB == null || loopState.loopB <= loopState.loopA + 500)) {
            queueTask.setStatus("Set A before B (at least 0.5s apart) on the playing track first.");
            return;
          }
          setLoopState((prev) => ({ ...prev, enabled: value }));
        }}
      />
      <Button
        title="Clear A–B loop"
        onPress={() =>
          setLoopState({ trackUri: "", loopA: null, loopB: null, enabled: false })
        }
      />

      <Label large>Per-Track Outro Auto-Skip</Label>
      <Toggle
        label="Enable outro auto-skip watcher"
        value={outroActive}
        onChange={(value) => {
          setOutroWatcher(value);
          setOutroActive(value);
        }}
      />
      <Label muted>
        {outroMs != null
          ? `Saved outro skip: ${formatDuration(outroMs)}`
          : "No outro skip set for this track."}
      </Label>
      <Button
        title="Set outro skip at current position"
        disabled={!isPlayingTarget}
        onPress={() => saveOutro(S.Player.getProgress())}
      />
      {outroMs != null ? (
        <View>
          <Button title="-5s earlier" onPress={() => saveOutro(outroMs - 5000)} />
          <Button title="+5s later" onPress={() => saveOutro(outroMs + 5000)} />
          <Button
            title="Clear outro skip for track"
            onPress={() => {
              if (targetTrack?.uri) bookmarksStore.clearOutro(targetTrack.uri);
              setOutroStatus("Outro skip cleared.");
              setBookmarkTick((n) => n + 1);
            }}
          />
        </View>
      ) : null}
      {outroStatus ? <Label muted>{outroStatus}</Label> : null}

      <Label large>Which Playlists Contain This Song?</Label>
      <Label muted>
        Matches exact URI, ISRC, and normalized title + artist (catches album vs
        deluxe/single duplicates). Cached for 15 minutes.
      </Label>
      <Button
        title="Find in playlists (cached)"
        disabled={playlistTask.busy || !targetTrack?.uri}
        onPress={() => scanPlaylists(false)}
      />
      <Button
        title="Rescan library playlists"
        disabled={playlistTask.busy || !targetTrack?.uri}
        onPress={() => scanPlaylists(true)}
      />
      <Status task={playlistTask} />
      {playlistMatches && playlistMatches.uri === targetTrack?.uri ? (
        playlistMatches.matches.length ? (
          <View>
            <Label muted>
              Found in {playlistMatches.matches.length} of{" "}
              {playlistMatches.scannedPlaylists} playlists (
              {playlistMatches.fromCache ? "cached" : "fresh scan"}):
            </Label>
            {playlistMatches.matches.map((pl: any) => (
              <View
                key={pl.uri}
                style={{
                  padding: 10,
                  backgroundColor: palette.card,
                  borderRadius: 10,
                  marginBottom: 6,
                }}
              >
                <Label>{pl.name}</Label>
                <Label muted>
                  {pl.trackCount} tracks · match: {pl.matchType} ({pl.matchedTitle})
                </Label>
                <Button
                  title="Open playlist"
                  onPress={() => S.Navigation.openSpotify(pl.uri)}
                />
              </View>
            ))}
          </View>
        ) : (
          <Label muted>
            Not found in {playlistMatches.scannedPlaylists} scanned library
            playlists.
          </Label>
        )
      ) : null}

      <Phase3Panel
        client={client}
        targetTrack={targetTrack}
        onExternalStateChange={() => setRatingTick((n) => n + 1)}
      />
    </Page>
  );
}

register("Queue & Bookmarks+", App, ["track"]);
