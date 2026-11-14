import React, { useEffect, useState } from "react";
import { Image, View } from "spotifyplus/react";
import { SpotifyPlus as S } from "spotifyplus";
import { clean } from "./model.mjs";
import {
  Button,
  Field,
  Label,
  Status,
  palette,
  useTask,
} from "./ui";
import {
  UpNextPeekStore,
  clampLeadSeconds,
} from "./up-next-peek.mjs";
import {
  KEYWORD_PRESETS,
  SmartSkipStore,
  buildStudioSearchQuery,
  clampAutoTrashThreshold,
  extractTrackArtists,
  rankStudioCandidates,
} from "./smart-skip.mjs";
import {
  fetchUniversalLinks,
  spotifyTrackUrl,
  youtubeVideoSearchUrl,
} from "./links-media.mjs";
import { NowPlayingBadgeStore } from "./nowplaying-badges.mjs";
import { spotifyCodePreviewBars, spotifyCodeUrl } from "./spotify-code.mjs";
import {
  notifyPhase3Subscribers,
  subscribePhase3Updates,
  syncPhase3RuntimeTimers,
} from "./phase3-overlay";

const peekStore = new UpNextPeekStore(S.Platform.Storage);
const smartSkipStore = new SmartSkipStore(S.Platform.Storage);
const npBadgeStore = new NowPlayingBadgeStore(S.Platform.Storage);

function copyText(text: string, label: string) {
  if (!text) return;
  try {
    S.Platform.Clipboard.writeText(text);
    S.toast(`${label} copied`);
  } catch {
    S.toast("Clipboard unavailable");
  }
}

function openExternalSafe(url: string) {
  if (!url) return;
  try {
    S.Navigation.openExternal(url);
  } catch {
    S.toast("Could not open external link");
  }
}

export function Phase3Panel({
  client,
  targetTrack,
  onExternalStateChange,
}: {
  client: any;
  targetTrack: { uri: string; title?: string; artist?: string; artists?: any[] } | null;
  onExternalStateChange?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [kwInput, setKwInput] = useState(() =>
    (smartSkipStore.readState().customKeywords || []).join(", "),
  );
  const [studioMatches, setStudioMatches] = useState<any[] | null>(null);
  const [universalLinks, setUniversalLinks] = useState<{
    trackUri: string;
    pageUrl: string;
    platforms: Array<{ id: string; label: string; url: string }>;
    fromCache?: boolean;
  } | null>(null);

  const studioTask = useTask();
  const linksTask = useTask();

  useEffect(
    () =>
      subscribePhase3Updates(
        () => {
          setTick((n) => n + 1);
          onExternalStateChange?.();
        },
        { ignorePeek: true },
      ),
    [],
  );

  const targetUri = targetTrack?.uri || "";
  const isTrackTarget = /^spotify:track:[A-Za-z0-9]+$/.test(targetUri);

  useEffect(() => {
    setStudioMatches(null);
    if (universalLinks && universalLinks.trackUri !== targetUri) {
      setUniversalLinks(null);
    }
  }, [targetUri]);

  const peekSettings = peekStore.getSettings();
  const skipState = smartSkipStore.readState();
  const badgeSettings = npBadgeStore.getSettings();
  void tick;

  const updatePeek = (patch: Record<string, any>) => {
    peekStore.saveSettings(patch);
    syncPhase3RuntimeTimers(client);
    notifyPhase3Subscribers("state");
    setTick((n) => n + 1);
  };

  const applySkipMutation = (fn: () => any) => {
    const next = fn();
    setKwInput((next?.customKeywords || []).join(", "));
    notifyPhase3Subscribers("state");
    setTick((n) => n + 1);
  };

  const updateBadges = (patch: Record<string, any>) => {
    npBadgeStore.saveSettings(patch);
    notifyPhase3Subscribers("state");
    setTick((n) => n + 1);
  };

  const trashedList = Object.values(skipState.trashedTracks || {}).sort(
    (a: any, b: any) => (b?.trashedAt || 0) - (a?.trashedAt || 0),
  );
  const bannedList = Object.entries(skipState.bannedArtists || {});
  const targetArtists = targetTrack ? extractTrackArtists(targetTrack) : [];
  const cleanTrackUrl = isTrackTarget ? spotifyTrackUrl(targetUri) : "";
  const codeUrl = isTrackTarget
    ? spotifyCodeUrl(targetUri, { bgHex: "181818", barColor: "white", size: 640 })
    : "";
  const codeBars = isTrackTarget ? spotifyCodePreviewBars(targetUri) : [];

  return (
    <View style={{ marginTop: 14 }}>
      <Label large>Up-Next Peek (Phase 3.5)</Label>
      <Label muted>
        Shows a NowPlaying pill and toast before the current track finishes.
      </Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        <Button
          title={`Up-Next Peek: ${peekSettings.enabled ? "ON" : "OFF"}`}
          active={peekSettings.enabled}
          onPress={() => updatePeek({ enabled: !peekSettings.enabled })}
        />
        <Button
          title={`Entry Toast: ${peekSettings.toastOnEnter ? "ON" : "OFF"}`}
          active={peekSettings.toastOnEnter}
          onPress={() => updatePeek({ toastOnEnter: !peekSettings.toastOnEnter })}
        />
      </View>
      <Label>Lead window: {peekSettings.leadSeconds}s (range 5–30s)</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Button
          title="-5s"
          onPress={() =>
            updatePeek({ leadSeconds: clampLeadSeconds(peekSettings.leadSeconds - 5) })
          }
        />
        <Button
          title="-1s"
          onPress={() =>
            updatePeek({ leadSeconds: clampLeadSeconds(peekSettings.leadSeconds - 1) })
          }
        />
        <Button
          title="+1s"
          onPress={() =>
            updatePeek({ leadSeconds: clampLeadSeconds(peekSettings.leadSeconds + 1) })
          }
        />
        <Button
          title="+5s"
          onPress={() =>
            updatePeek({ leadSeconds: clampLeadSeconds(peekSettings.leadSeconds + 5) })
          }
        />
      </View>

      <Label large>Smart Auto-Skip &amp; Trashbin (Phase 3.6)</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        <Button
          title={`Smart Auto-Skip: ${skipState.enabled ? "ON" : "OFF"}`}
          active={skipState.enabled}
          onPress={() => applySkipMutation(() => smartSkipStore.setEnabled(!skipState.enabled))}
        />
        <Button
          title={`Auto-Trash Skipped: ${skipState.autoTrashEnabled ? "ON" : "OFF"}`}
          active={skipState.autoTrashEnabled}
          onPress={() =>
            applySkipMutation(() =>
              smartSkipStore.setAutoTrash(!skipState.autoTrashEnabled),
            )
          }
        />
      </View>
      {skipState.autoTrashEnabled ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Label muted>
            Auto-trash after {skipState.autoTrashThreshold} manual skips:
          </Label>
          <Button
            title="-1"
            onPress={() =>
              applySkipMutation(() =>
                smartSkipStore.setAutoTrash(
                  true,
                  clampAutoTrashThreshold(skipState.autoTrashThreshold - 1),
                ),
              )
            }
          />
          <Button
            title="+1"
            onPress={() =>
              applySkipMutation(() =>
                smartSkipStore.setAutoTrash(
                  true,
                  clampAutoTrashThreshold(skipState.autoTrashThreshold + 1),
                ),
              )
            }
          />
        </View>
      ) : null}

      <Label muted>Skip matching track or album versions:</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {KEYWORD_PRESETS.map((preset) => {
          const active = Boolean(skipState.activePresets?.[preset.id]);
          return (
            <Button
              key={preset.id}
              title={`${preset.label}${active ? " ✓" : ""}`}
              active={active}
              onPress={() =>
                applySkipMutation(() => smartSkipStore.togglePreset(preset.id, !active))
              }
            />
          );
        })}
      </View>

      <Field
        label="Custom blocked keywords (comma-separated)"
        value={kwInput}
        onChange={setKwInput}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Button
          title="Save custom keywords"
          onPress={() => {
            applySkipMutation(() => smartSkipStore.setCustomKeywords(kwInput));
            S.toast("Custom skip keywords saved");
          }}
        />
        <Button
          title="Clear custom"
          onPress={() => {
            applySkipMutation(() => smartSkipStore.setCustomKeywords(""));
            S.toast("Custom skip keywords cleared");
          }}
        />
      </View>

      {isTrackTarget && targetTrack ? (
        <View
          style={{
            padding: 10,
            backgroundColor: palette.card,
            borderRadius: 10,
            marginBottom: 8,
          }}
        >
          <Label muted>Track Actions: {targetTrack.title || targetUri}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            <Button
              title={
                skipState.trashedTracks?.[targetUri]
                  ? "Restore from Trashbin"
                  : "Trash & Skip Track"
              }
              active={Boolean(skipState.trashedTracks?.[targetUri])}
              onPress={() => {
                if (skipState.trashedTracks?.[targetUri]) {
                  applySkipMutation(() => smartSkipStore.restoreTrack(targetUri));
                  S.toast("Restored from Trashbin");
                  return;
                }
                applySkipMutation(() => smartSkipStore.trashTrack(targetTrack, "manual"));
                S.toast(`Trashed "${targetTrack.title || targetUri}"`);
                try {
                  if (S.Player.getState()?.trackUri === targetUri) {
                    S.Player.skipNext();
                  }
                } catch {
                  // Ignore if not active track.
                }
              }}
            />
            {targetArtists.slice(0, 2).map((artistName) => {
              const key = clean(artistName);
              const banned = Boolean(key && skipState.bannedArtists?.[key]);
              return (
                <Button
                  key={artistName}
                  title={banned ? `Unban ${artistName}` : `Ban ${artistName}`}
                  active={banned}
                  onPress={() =>
                    applySkipMutation(() =>
                      banned
                        ? smartSkipStore.unbanArtist(artistName)
                        : smartSkipStore.banArtist(artistName),
                    )
                  }
                />
              );
            })}
            <Button
              title="Find Original Studio Version"
              disabled={studioTask.busy}
              onPress={() =>
                studioTask.run(
                  async (job, progress) => {
                    const query = buildStudioSearchQuery(targetTrack);
                    if (!query) throw new Error("Track title missing for studio lookup.");
                    progress(`Searching studio candidates for "${query}"…`);
                    const res = await S.Search.search(query, { limit: 10 });
                    const rawItems = (res?.items || []).filter(
                      (item: any) =>
                        typeof item?.uri === "string" &&
                        item.uri.startsWith("spotify:track:") &&
                        item.uri !== targetUri,
                    );
                    const hydrated: any[] = [];
                    for (const item of rawItems.slice(0, 8)) {
                      if (job.cancelled) break;
                      try {
                        const meta = await client.track(item.uri);
                        if (meta) hydrated.push(meta);
                      } catch {
                        // Skip individual hydration error.
                      }
                    }
                    return rankStudioCandidates(hydrated, targetTrack);
                  },
                  (matches) => setStudioMatches(matches || []),
                )
              }
            />
          </View>
          <Status task={studioTask} />

          {studioMatches ? (
            studioMatches.length ? (
              <View style={{ marginTop: 6 }}>
                <Label muted>Best Original / Studio Matches:</Label>
                {studioMatches.slice(0, 4).map((cand: any) => (
                  <View
                    key={cand.uri}
                    style={{
                      padding: 8,
                      backgroundColor: "#242834",
                      borderRadius: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Label>{cand.title || cand.name}</Label>
                    <Label muted>
                      {cand.artist ||
                        (Array.isArray(cand.artists)
                          ? cand.artists.map((a: any) => a?.name || a).join(", ")
                          : "")}
                    </Label>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      <Button
                        title="Queue Studio"
                        onPress={() => {
                          try {
                            S.Queue.add(cand.uri);
                            S.toast("Added studio version to queue");
                          } catch {
                            S.toast("Could not add to queue");
                          }
                        }}
                      />
                      <Button
                        title="Open Track"
                        onPress={() => S.Navigation.openSpotify(cand.uri)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Label muted>No cleaner studio match found.</Label>
            )
          ) : null}
        </View>
      ) : null}

      <Label>
        Trashed Tracks ({trashedList.length}){bannedList.length ? ` · Banned Artists (${bannedList.length})` : ""}
      </Label>
      {trashedList.length ? (
        <View style={{ marginBottom: 8 }}>
          {trashedList.slice(0, 15).map((item: any) => (
            <View
              key={item.uri}
              style={{
                padding: 8,
                backgroundColor: palette.card,
                borderRadius: 8,
                marginBottom: 4,
              }}
            >
              <Label>{item.title || item.uri}</Label>
              <Label muted>
                {item.artist ? `${item.artist} · ` : ""}
                {item.reason || "manual"}
              </Label>
              <Button
                title="Restore"
                onPress={() => applySkipMutation(() => smartSkipStore.restoreTrack(item.uri))}
              />
            </View>
          ))}
          {trashedList.length > 15 ? (
            <Label muted>Showing latest 15 of {trashedList.length} trashed tracks.</Label>
          ) : null}
          <Button
            title="Clear Trashbin"
            onPress={() => {
              applySkipMutation(() => smartSkipStore.clearTrash());
              S.toast("Trashbin cleared");
            }}
          />
        </View>
      ) : (
        <Label muted>No trashed tracks.</Label>
      )}

      {bannedList.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {bannedList.map(([key, info]: [string, any]) => (
            <Button
              key={key}
              title={`Unban ${info?.name || key}`}
              onPress={() => applySkipMutation(() => smartSkipStore.unbanArtist(key))}
            />
          ))}
        </View>
      ) : null}

      <Label large>Universal Track Links &amp; Music Video (Phase 3.7b)</Label>
      {isTrackTarget && targetTrack ? (
        <View
          style={{
            padding: 10,
            backgroundColor: palette.card,
            borderRadius: 10,
            marginBottom: 8,
          }}
        >
          <Label muted>{cleanTrackUrl}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            <Button
              title="Copy Clean Link (no ?si=)"
              onPress={() => copyText(cleanTrackUrl, "Clean track link")}
            />
            <Button
              title="Watch Music Video (YouTube)"
              onPress={() => openExternalSafe(youtubeVideoSearchUrl(targetTrack))}
            />
            <Button
              title="Find on Other Services (Song.link)"
              disabled={linksTask.busy}
              onPress={() =>
                linksTask.run(
                  async (_job, progress) => {
                    progress("Querying Song.link cross-platform matches…");
                    const res = await fetchUniversalLinks(targetUri, S.Platform.Storage);
                    return {
                      trackUri: targetUri,
                      pageUrl: res.pageUrl || "",
                      platforms: res.platforms || [],
                      fromCache: Boolean(res.fromCache),
                    };
                  },
                  (res) => setUniversalLinks(res),
                )
              }
            />
          </View>
          <Status task={linksTask} />

          {universalLinks && universalLinks.trackUri === targetUri ? (
            <View style={{ marginTop: 6 }}>
              <Label muted>
                {universalLinks.fromCache ? "Cached 7d" : "Live"} Song.link matches:
              </Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {universalLinks.pageUrl ? (
                  <Button
                    title="Open Song.link Page"
                    onPress={() => openExternalSafe(universalLinks.pageUrl)}
                  />
                ) : null}
                {universalLinks.pageUrl ? (
                  <Button
                    title="Copy Song.link URL"
                    onPress={() => copyText(universalLinks.pageUrl, "Song.link URL")}
                  />
                ) : null}
                {universalLinks.platforms.map((plat) => (
                  <Button
                    key={plat.id}
                    title={plat.label}
                    onPress={() => openExternalSafe(plat.url)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Label muted>Select or play a track to copy clean links or open Song.link.</Label>
      )}

      <Label large>NowPlaying Badges &amp; Spotify Code (Phase 3.8)</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Button
          title={`Overlay HUD: ${badgeSettings.enabled ? "ON" : "OFF"}`}
          active={badgeSettings.enabled}
          onPress={() => updateBadges({ enabled: !badgeSettings.enabled })}
        />
        <Button
          title={`Release & Age: ${badgeSettings.showReleaseAge ? "ON" : "OFF"}`}
          active={badgeSettings.showReleaseAge}
          onPress={() => updateBadges({ showReleaseAge: !badgeSettings.showReleaseAge })}
        />
        <Button
          title={`Rating & Plays: ${badgeSettings.showRatingAndPlays ? "ON" : "OFF"}`}
          active={badgeSettings.showRatingAndPlays}
          onPress={() =>
            updateBadges({ showRatingAndPlays: !badgeSettings.showRatingAndPlays })
          }
        />
        <Button
          title={`Quick +BM: ${badgeSettings.showQuickBookmark ? "ON" : "OFF"}`}
          active={badgeSettings.showQuickBookmark}
          onPress={() =>
            updateBadges({ showQuickBookmark: !badgeSettings.showQuickBookmark })
          }
        />
        <Button
          title={`Code Pill: ${badgeSettings.showSpotifyCodeButton ? "ON" : "OFF"}`}
          active={badgeSettings.showSpotifyCodeButton}
          onPress={() =>
            updateBadges({
              showSpotifyCodeButton: !badgeSettings.showSpotifyCodeButton,
            })
          }
        />
      </View>

      {isTrackTarget && codeUrl ? (
        <View
          style={{
            padding: 12,
            backgroundColor: "#181818",
            borderRadius: 12,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Label>Scannable Spotify Code (Charcoal Non-AMOLED)</Label>
          <Image
            src={codeUrl}
            style={{
              width: 240,
              height: 60,
              borderRadius: 8,
              backgroundColor: "#181818",
              marginTop: 6,
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
            {codeBars.map((ratio, idx) => (
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
          <Button
            title="Open Scannable PNG in Browser"
            onPress={() => openExternalSafe(codeUrl)}
          />
        </View>
      ) : null}
    </View>
  );
}
