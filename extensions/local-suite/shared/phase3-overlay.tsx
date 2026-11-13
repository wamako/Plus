import React, { useEffect, useState } from "react";
import { View, Text, Image, SafeAreaView } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { formatDuration } from "./model.mjs";
import { BookmarksStore, RatingsStore, StatsBridge } from "./suite-store.mjs";
import {
  UpNextPeekStore,
  clampLeadSeconds,
  evaluateUpNextPeek,
} from "./up-next-peek.mjs";
import {
  SmartSkipStore,
  evaluateTrackAutoSkip,
} from "./smart-skip.mjs";
import {
  NowPlayingBadgeStore,
  buildBadgeSummary,
} from "./nowplaying-badges.mjs";
import {
  spotifyTrackUrl,
  youtubeVideoSearchUrl,
} from "./links-media.mjs";
import { spotifyCodeUrl, spotifyCodePreviewBars } from "./spotify-code.mjs";

const peekStore = new UpNextPeekStore(S.Platform.Storage);
const smartSkipStore = new SmartSkipStore(S.Platform.Storage);
const npBadgeStore = new NowPlayingBadgeStore(S.Platform.Storage);
const bookmarksStore = new BookmarksStore(S.Platform.Storage);
const ratingsStore = new RatingsStore(S.Platform.Storage);
const statsBridge = new StatsBridge(S.Platform.Storage);

const TRACK_RELEASE_CACHE = new Map<string, string | Record<string, any>>();
const UPCOMING_META_CACHE = new Map<string, { title: string; artist: string }>();
const LISTENERS = new Set<(kind: "peek" | "state") => void>();

let initialized = false;
let peekTimer: ReturnType<typeof setInterval> | undefined;
let dismissedTriggerKey = "";
let lastToastedTriggerKey = "";
let currentPeek: any = null;
let currentObservedTrack: any = null;
let lastAutoSkippedUri = "";
let lastAutoSkippedAt = 0;
let autoSkipTimes: number[] = [];
let loopPauseUntil = 0;
let runtimeClient: any = null;

export function notifyPhase3Subscribers(kind: "peek" | "state" = "state") {
  for (const fn of LISTENERS) {
    try {
      fn(kind);
    } catch {
      // Listener errors should not break background sync.
    }
  }
}

export function subscribePhase3Updates(
  fn: () => void,
  { ignorePeek = false }: { ignorePeek?: boolean } = {},
) {
  const wrapper = (kind: "peek" | "state") => {
    if (ignorePeek && kind === "peek") return;
    fn();
  };
  LISTENERS.add(wrapper);
  return () => {
    LISTENERS.delete(wrapper);
  };
}

export function getActivePeekState() {
  return currentPeek;
}

export function dismissActivePeek(triggerKey: string) {
  dismissedTriggerKey = triggerKey || currentPeek?.triggerKey || "";
  currentPeek = null;
  notifyPhase3Subscribers("peek");
}

function safeToast(text: string, length: "short" | "long" = "short") {
  try {
    S.toast?.(text, length);
  } catch {
    // Ignore when toast bridge is mocked out in host preflight.
  }
}

function rememberBounded<V>(cache: Map<string, V>, key: string, value: V, max = 80) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function resolveTrackForRuntime(client: any, uri: string) {
  try {
    const cur = S.Player.getCurrentTrack();
    if (cur?.uri === uri) {
      return {
        uri: cur.uri,
        title: cur.title || uri,
        artist: cur.artist || (cur.artists || []).join(", "),
        artists: cur.artists || [],
        album: cur.album || "",
      };
    }
  } catch {
    // Fall back to DataClient.
  }
  try {
    return await client.track(uri);
  } catch {
    return { uri, title: uri, artist: "" };
  }
}

async function resolveReleaseDateForTrack(uri: string): Promise<string | Record<string, any>> {
  if (!uri || !/^spotify:track:/.test(uri)) return "";
  if (TRACK_RELEASE_CACHE.has(uri)) {
    return TRACK_RELEASE_CACHE.get(uri) || "";
  }
  try {
    const internalAny = S.Internal as any;
    const raw = typeof internalAny?.getTrack === "function"
      ? await internalAny.getTrack(uri)
      : null;
    let release: any =
      raw?.album?.date ||
      raw?.album?.releaseDate ||
      raw?.album?.release ||
      raw?.releaseDate ||
      "";
    let albumUri = raw?.album?.uri || raw?.albumUri || "";
    if (!albumUri) {
      try {
        const state = S.Player.getState();
        if (
          state?.trackUri === uri &&
          /^spotify:album:[A-Za-z0-9]{22}$/.test(state?.contextUri || "")
        ) {
          albumUri = state.contextUri;
        }
      } catch {
        // Ignore player state unavailability.
      }
    }
    if (!release && albumUri && typeof internalAny?.getAlbum === "function") {
      const albumMeta = await internalAny.getAlbum(albumUri);
      release =
        albumMeta?.date ||
        albumMeta?.releaseDate ||
        albumMeta?.release ||
        "";
    }
    if (!release && typeof runtimeClient?.identify === "function") {
      try {
        const identified = await runtimeClient.identify({
          uri,
          artists: [],
          album: "",
          albumUri: "",
          image: "",
          releaseDate: "",
        });
        release = identified?.releaseDate || "";
      } catch {
        // Ignore fallback metadata errors gracefully.
      }
    }
    if (release) {
      rememberBounded(TRACK_RELEASE_CACHE, uri, release, 100);
      return release;
    }
  } catch {
    // Release metadata is optional; omit badge gracefully if offline or unavailable.
  }
  return "";
}

function runPeekEvaluation(client: any) {
  const settings = peekStore.getSettings();
  if (!settings.enabled) {
    if (currentPeek) {
      currentPeek = null;
      notifyPhase3Subscribers("peek");
    }
    return;
  }

  try {
    const apiAny = S as any;
    if (typeof S.Queue?.get !== "function" && typeof apiAny.UpNext?.get !== "function") {
      return;
    }
    const playerState = S.Player.getState();
    const currentTrack = S.Player.getCurrentTrack();
    const positionMs = S.Player.getProgress();
    const queue = typeof S.Queue?.get === "function" ? S.Queue.get() : null;
    const upNext = typeof apiAny.UpNext?.get === "function" ? apiAny.UpNext.get() : null;

    const decision: any = evaluateUpNextPeek({
      enabled: settings.enabled,
      leadSeconds: clampLeadSeconds(settings.leadSeconds),
      playerState,
      currentTrack,
      positionMs,
      queue,
      upNext,
      dismissedKey: dismissedTriggerKey,
    });

    if (!decision.show) {
      if (currentPeek) {
        currentPeek = null;
        notifyPhase3Subscribers("peek");
      }
      return;
    }

    const cached = UPCOMING_META_CACHE.get(decision.nextUri);
    const title = cached?.title || decision.title;
    const artist = cached?.artist || decision.artist;

    const nextPeek = {
      ...decision,
      title,
      artist,
    };

    const changed =
      !currentPeek ||
      currentPeek.triggerKey !== nextPeek.triggerKey ||
      currentPeek.remainingSec !== nextPeek.remainingSec ||
      currentPeek.title !== nextPeek.title;

    currentPeek = nextPeek;

    if (decision.needsMetadataLookup && !cached && decision.nextUri) {
      client
        .track(decision.nextUri)
        .then((meta: any) => {
          if (meta?.title) {
            rememberBounded(UPCOMING_META_CACHE, decision.nextUri, {
              title: meta.title,
              artist: meta.artist || "",
            });
            if (currentPeek?.nextUri === decision.nextUri) {
              currentPeek = {
                ...currentPeek,
                title: meta.title,
                artist: meta.artist || currentPeek.artist,
              };
              notifyPhase3Subscribers("peek");
            }
          }
        })
        .catch(() => {});
    }

    if (
      settings.toastOnEnter &&
      lastToastedTriggerKey !== nextPeek.triggerKey &&
      (!decision.needsMetadataLookup || Boolean(cached?.title))
    ) {
      lastToastedTriggerKey = nextPeek.triggerKey;
      safeToast(
        `${nextPeek.badge}: ${nextPeek.title}${nextPeek.artist ? ` \u2014 ${nextPeek.artist}` : ""} (${nextPeek.remainingSec}s)`,
        "long",
      );
    }

    if (changed) {
      notifyPhase3Subscribers("peek");
    }
  } catch {
    // Background poll must stay resilient when player bridge is idle.
  }
}

export function syncPhase3RuntimeTimers(client: any) {
  if (peekTimer) {
    clearInterval(peekTimer);
    peekTimer = undefined;
  }
  const settings = peekStore.getSettings();
  if (settings.enabled) {
    peekTimer = setInterval(() => runPeekEvaluation(client), 2200);
  } else {
    currentPeek = null;
    notifyPhase3Subscribers("peek");
  }
}

export function initPhase3Runtime(client: any) {
  if (client) runtimeClient = client;
  if (initialized) return;
  initialized = true;

  syncPhase3RuntimeTimers(client);

  S.Events.on("songChanged", async (ev: any) => {
    const newUri = ev?.uri || "";
    const prevUri = ev?.previousUri || currentObservedTrack?.uri || "";
    const reason = ev?.reason || "unknown";

    currentPeek = null;
    dismissedTriggerKey = "";
    lastToastedTriggerKey = "";

    const justAutoSkipped =
      prevUri &&
      prevUri === lastAutoSkippedUri &&
      Date.now() - lastAutoSkippedAt < 4500;

    if (prevUri) {
      if (reason === "skip-next" && !justAutoSkipped) {
        const trackForSkip =
          currentObservedTrack?.uri === prevUri
            ? currentObservedTrack
            : await resolveTrackForRuntime(client, prevUri);
        const res = smartSkipStore.recordManualSkip(trackForSkip);
        if (res.trashed) {
          safeToast(
            `Auto-trashed "${trackForSkip?.title || prevUri}" after ${res.count} skips`,
            "long",
          );
        }
      } else if (reason === "track-ended") {
        smartSkipStore.resetSkipStreak(prevUri);
      }
    }

    if (!newUri || !/^spotify:track:/.test(newUri)) {
      currentObservedTrack = null;
      notifyPhase3Subscribers();
      return;
    }

    const activeTrack = await resolveTrackForRuntime(client, newUri);
    currentObservedTrack = activeTrack;
    notifyPhase3Subscribers();

    const skipState = smartSkipStore.readState();
    const skipDecision = evaluateTrackAutoSkip(skipState, activeTrack);
    if (skipDecision.skip && Date.now() >= loopPauseUntil) {
      const now = Date.now();
      autoSkipTimes = autoSkipTimes.filter((t) => now - t < 10000);
      if (autoSkipTimes.length >= 5) {
        loopPauseUntil = now + 15000;
        autoSkipTimes = [];
        safeToast("Smart Skip paused 15s (5 consecutive skips)", "long");
        return;
      }
      autoSkipTimes.push(now);
      lastAutoSkippedUri = activeTrack.uri;
      lastAutoSkippedAt = now;
      safeToast(`Smart Skip (${skipDecision.reason}): ${activeTrack.title || newUri}`);
      try {
        S.Player.skipNext();
      } catch {
        // Ignore if host rejects skipNext during transition.
      }
    }
  });

  try {
    new S.ContextMenu(
      "Watch Music Video (YouTube)",
      async (uri) => {
        const track = await resolveTrackForRuntime(client, uri);
        S.Navigation.openExternal(youtubeVideoSearchUrl(track));
      },
      undefined,
      false,
      ["track"],
    ).register();

    new S.ContextMenu(
      "Trash & Smart-Skip Track",
      async (uri) => {
        const track = await resolveTrackForRuntime(client, uri);
        smartSkipStore.trashTrack(track, "context-menu");
        notifyPhase3Subscribers();
        safeToast(`Trashed "${track?.title || uri}"`);
        try {
          if (S.Player.getState()?.trackUri === track?.uri) {
            lastAutoSkippedUri = track.uri;
            lastAutoSkippedAt = Date.now();
            S.Player.skipNext();
          }
        } catch {
          // Safe fallback if playback state isn't active.
        }
      },
      undefined,
      false,
      ["track"],
    ).register();

    new S.ContextMenu(
      "Copy Clean Link (no ?si=)",
      (uri) => {
        const clean = spotifyTrackUrl(uri) || uri;
        try {
          S.Platform.Clipboard.writeText(clean);
          safeToast("Copied clean link");
        } catch {
          // Clipboard write failed.
        }
      },
      undefined,
      false,
      ["track"],
    ).register();
  } catch {
    // Ignore context menu registration failures on minimal test harnesses.
  }

  if (typeof S.UI?.overlay === "function") {
    try {
      S.UI.overlay("nowPlaying.page", NowPlayingPhase3Overlay);
    } catch {
      // Host build without UI overlay support gracefully skips badge HUD.
    }
  }
}

export function NowPlayingPhase3Overlay({ context }: { context?: { uri?: string | null } }) {
  const [, setTick] = useState(0);
  const [releaseDate, setReleaseDate] = useState<string | Record<string, any>>("");
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [showStarRow, setShowStarRow] = useState(false);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    LISTENERS.add(bump);
    return () => {
      LISTENERS.delete(bump);
    };
  }, []);

  let playerTrack: any = null;
  let playerState: any = null;
  try {
    playerState = S.Player.getState();
    playerTrack = S.Player.getCurrentTrack();
  } catch {
    playerState = null;
    playerTrack = null;
  }

  const uri = context?.uri || playerState?.trackUri || playerTrack?.uri || "";

  useEffect(() => {
    let cancelled = false;
    setReleaseDate("");
    if (!uri || !/^spotify:track:/.test(uri)) return;
    resolveReleaseDateForTrack(uri).then((value) => {
      if (!cancelled && value) setReleaseDate(value);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const badgeSettings = npBadgeStore.getSettings();
  const peek = currentPeek;
  if (!uri || (!badgeSettings.enabled && !peek?.show)) {
    return null;
  }

  const rating = badgeSettings.showRatingAndPlays ? ratingsStore.get(uri) : null;
  const playCount = badgeSettings.showRatingAndPlays
    ? statsBridge.readSummary()?.tracks?.[uri]?.count ?? null
    : null;
  const badgeInfo = buildBadgeSummary({
    releaseDate: badgeSettings.showReleaseAge ? releaseDate : "",
    rating,
    playCount,
  });

  const codeUrl = showCodePanel ? spotifyCodeUrl(uri, { bgHex: "181818", barColor: "white", size: 640 }) : "";
  const previewBars = showCodePanel ? spotifyCodePreviewBars(uri) : [];

  return (
    <SafeAreaView
      style={{
        paddingHorizontal: 14,
        paddingTop: 56,
        paddingBottom: 6,
        alignItems: "flex-end",
      }}
    >
      {peek?.show ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#E819222C",
            borderColor: "#66A6F5CE",
            borderWidth: 1,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginBottom: 6,
          }}
        >
          <View
            onPress={() => {
              try {
                dismissActivePeek(peek.triggerKey);
                S.Player.skipNext();
              } catch {
                // Ignore if player cannot skip right now.
              }
            }}
            style={{ marginRight: 10 }}
          >
            <Text style={{ color: "#A6F5CE", fontSize: 12, fontWeight: "700" }}>
              {`${peek.badge} \u00B7 ${peek.title}${peek.artist ? ` (${peek.artist})` : ""} \u00B7 ${peek.remainingSec}s`}
            </Text>
          </View>
          <View onPress={() => dismissActivePeek(peek.triggerKey)}>
            <Text style={{ color: "#B5C6D5", fontSize: 13, fontWeight: "700" }}>
              {"\u00D7"}
            </Text>
          </View>
        </View>
      ) : null}

      {badgeSettings.enabled ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#E0181822",
            borderColor: "#33FFFFFF",
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <View
            onPress={() => {
              setShowCodePanel(false);
              setShowStarRow((v) => !v);
            }}
            style={{ paddingHorizontal: 4, paddingVertical: 2 }}
          >
            <Text style={{ color: "#F5F7FA", fontSize: 11, fontWeight: "600" }}>
              {badgeInfo.text}
            </Text>
          </View>

          {badgeSettings.showQuickBookmark ? (
            <View
              onPress={() => {
                try {
                  const pos = Math.max(0, Number(S.Player.getProgress()) || 0);
                  bookmarksStore.add({
                    uri,
                    title: playerTrack?.title || uri,
                    artist: playerTrack?.artist || "",
                    positionMs: pos,
                    note: "Quick NowPlaying pin",
                  });
                  safeToast(`Bookmarked @ ${formatDuration(pos)}`);
                  notifyPhase3Subscribers();
                } catch {
                  // Ignore transient player unavailability.
                }
              }}
              style={{
                backgroundColor: "#294C40",
                borderRadius: 10,
                paddingHorizontal: 7,
                paddingVertical: 2,
                marginLeft: 6,
              }}
            >
              <Text style={{ color: "#A6F5CE", fontSize: 11, fontWeight: "700" }}>
                +BM
              </Text>
            </View>
          ) : null}

          {badgeSettings.showSpotifyCodeButton ? (
            <View
              onPress={() => {
                setShowStarRow(false);
                setShowCodePanel((v) => !v);
              }}
              style={{
                backgroundColor: showCodePanel ? "#294C40" : "#242834",
                borderRadius: 10,
                paddingHorizontal: 7,
                paddingVertical: 2,
                marginLeft: 5,
              }}
            >
              <Text style={{ color: "#F5F7FA", fontSize: 11, fontWeight: "700" }}>
                Code
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {showStarRow && badgeSettings.enabled ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            backgroundColor: "#F0181822",
            borderColor: "#33FFFFFF",
            borderWidth: 1,
            borderRadius: 14,
            padding: 8,
            marginTop: 6,
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
            <View
              key={star}
              onPress={() => {
                ratingsStore.set(uri, star, {
                  title: playerTrack?.title || "",
                  artist: playerTrack?.artist || "",
                });
                setShowStarRow(false);
                safeToast(`Rated ${star}\u2605`);
                notifyPhase3Subscribers();
              }}
              style={{
                backgroundColor: rating === star ? "#294C40" : "#222A36",
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 4,
                margin: 2,
              }}
            >
              <Text style={{ color: rating === star ? "#A6F5CE" : "#F5F7FA", fontSize: 12 }}>
                {`${star}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {showCodePanel && codeUrl ? (
        <View
          style={{
            backgroundColor: "#F2181818",
            borderColor: "#44FFFFFF",
            borderWidth: 1,
            borderRadius: 16,
            padding: 12,
            marginTop: 6,
            width: 240,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#F5F7FA", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
            Scannable Spotify Code
          </Text>
          <Image
            src={codeUrl}
            style={{
              width: 210,
              height: 54,
              borderRadius: 8,
              backgroundColor: "#181818",
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              height: 18,
              marginTop: 6,
              marginBottom: 8,
            }}
          >
            {previewBars.map((ratio, idx) => (
              <View
                key={idx}
                style={{
                  width: 3,
                  height: Math.max(4, Math.round(ratio * 16)),
                  backgroundColor: "#66A6F5CE",
                  borderRadius: 2,
                  marginHorizontal: 2,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row" }}>
            <View
              onPress={() => {
                try {
                  S.Platform.Clipboard.writeText(spotifyTrackUrl(uri) || uri);
                  safeToast("Clean link copied");
                } catch {
                  // Ignore clipboard failure.
                }
              }}
              style={{
                backgroundColor: "#242834",
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 4,
                marginRight: 6,
              }}
            >
              <Text style={{ color: "#F5F7FA", fontSize: 11 }}>Copy Link</Text>
            </View>
            <View
              onPress={() => setShowCodePanel(false)}
              style={{
                backgroundColor: "#242834",
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: "#B5C6D5", fontSize: 11 }}>Close</Text>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
