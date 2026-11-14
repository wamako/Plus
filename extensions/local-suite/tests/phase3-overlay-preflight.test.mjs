import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Module from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = await fs.realpath(path.join(root, "node_modules/spotifyplus"));
process.env.NODE_PATH = path.join(sdk, "node_modules");
Module._initPaths();
const host = path.resolve(sdk, "../nodejs");

const { ScriptLoader } = await import(
  pathToFileURL(path.join(host, "loader/script-loader.js"))
);
const { ScriptRegistry } = await import(
  pathToFileURL(path.join(host, "loader/script-registry.js"))
);
const { UITargetRegistry } = await import(
  pathToFileURL(path.join(host, "ui/target-registry.js"))
);
const { setCommitListener, dispatchReactEvent } = await import(
  pathToFileURL(path.join(host, "ui/renderer.js"))
);

const TRACK_A = "spotify:track:4cOdK2wGLETKBW3PvgPWqT";
const TRACK_B = "spotify:track:1111111111111111111111";
const TRACK_LIVE = "spotify:track:2222222222222222222222";

const text = (node) =>
  node?.type === "TEXT_INSTANCE"
    ? node.text
    : (node?.children || []).map(text).join(" ").replace(/\s+/g, " ").trim();
const nodes = (node) => [node, ...(node?.children || []).flatMap(nodes)];
const delay = () => new Promise((r) => setTimeout(r, 8));

test("Phase 3 runtime inside compiled bookmarks-plus bundle: overlay HUD, context menus, auto-skip & loop guard", async () => {
  const storage = new Map();
  const clipboard = [];
  const navigations = [];
  const toasts = [];
  const errors = [];
  const menus = [];
  const surfaces = new Map();
  let skipCount = 0;

  let activeTrack = {
    uri: TRACK_A,
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    artists: [{ name: "Rick Astley" }],
    album: { title: "Whenever You Need Somebody", date: "1987-11-16" },
    durationMs: 213000,
  };
  let activeState = {
    trackUri: TRACK_A,
    contextUri: "spotify:album:6N9PS4PsX1X2T2X3X4X5X6",
    isPlaying: true,
    isPaused: false,
    positionMs: 42000,
  };

  const logger = {
    child() {
      return this;
    },
    info() {},
    warn() {},
    error(...args) {
      errors.push(args);
    },
  };
  const registry = new ScriptRegistry(logger, () => {});
  const ui = new UITargetRegistry({
    async request(op, data) {
      if (op === "ui.inspect") {
        return {
          name: typeof data?.target === "string" ? data.target : "nowPlaying.page",
          available: true,
          operations: ["replace", "overlay"],
          instances: 1,
          conflicts: [],
        };
      }
      if (op === "ui.attach") {
        const sid = `target:${data.instanceId}`;
        setCommitListener(sid, (ops) => {
          const tree = ui.targets.get(data.instanceId)?.root?.getTree() || null;
          surfaces.set(sid, { ops, tree });
        });
        return { surfaceId: sid };
      }
      if (op === "ui.detach") {
        surfaces.delete(data.surfaceId);
        return {};
      }
      return {};
    },
    registerSurface() {},
    unregisterSurface() {},
    report(_owner, err) {
      errors.push(["ui.report", err]);
    },
  });

  const runtime = {
    registry,
    ui,
    platformData: {
      clientVersion: "9.1.94.1929",
      osName: "Android",
      osVersion: "17",
      sdkVersion: 37,
    },
    session: { accessToken: "test-token" },
    storageGet: (s, k) => (storage.has(`${s}:${k}`) ? structuredClone(storage.get(`${s}:${k}`)) : null),
    storageSet: (s, k, v) => storage.set(`${s}:${k}`, structuredClone(v)),
    storageRemove: (s, k) => storage.delete(`${s}:${k}`),
    registerSideDrawer() {},
    registerContextMenu(_id, _scriptId, menu) {
      menus.push(menu);
    },
    createWorkletContext() {
      return true;
    },
    createAnimationAdapter() {
      return {};
    },
    disposeWorkletContext() {},
    unregisterScript: (s) => registry.unregisterScript(s),
    logScript(_s, level, args) {
      if (level === "error") errors.push(args);
    },
    callApiSync(op, args) {
      if (op === "player.state") return activeState;
      if (op === "player.currentTrack") return activeTrack;
      if (op === "player.progress") return activeState.positionMs;
      if (op === "player.skipNext") {
        skipCount++;
        return null;
      }
      if (op === "queue.get") return { next: [] };
      if (op === "upNext.get") return { current: { uri: activeTrack.uri }, next: [] };
      if (op === "clipboard.write") {
        clipboard.push(args?.text || "");
        return null;
      }
      if (op === "queue.add") return null;
      throw new Error(`Unexpected sync API: ${op}`);
    },
    async requestApi(op, args) {
      if (op === "library.list") return { items: [], total: 0 };
      if (op === "search") return { items: [] };
      throw new Error(`Unexpected async API: ${op}`);
    },
    async getTrack(uri) {
      if (uri === TRACK_LIVE) {
        return {
          uri,
          title: "Everlong (Live at Wembley)",
          artist: "Foo Fighters",
          artists: [{ name: "Foo Fighters" }],
          album: { title: "Live", date: "2008-06-07" },
          durationMs: 250000,
        };
      }
      if (uri === TRACK_B) {
        return {
          uri,
          title: "Skip Candidate",
          artist: "Some Artist",
          artists: [{ name: "Some Artist" }],
          album: { title: "Single", date: "2020-01-01" },
          durationMs: 180000,
        };
      }
      return activeTrack;
    },
    getCurrentTrack: () => activeTrack,
    getProgress: () => activeState.positionMs,
    closeSurface: (s) => {
      registry.unmountSurface(s, "sideDrawer");
      return true;
    },
    navigate(uri, target) {
      navigations.push({ uri, target });
      return true;
    },
    sendCommand() {},
    toast(msg) {
      toasts.push(String(msg));
    },
    navigateBack() {},
  };

  const loader = new ScriptLoader(runtime, logger);
  loader.loadScript(
    path.join(root, "build/SpotifyPlus-Local-Extensions/bookmarks-plus"),
    "user",
  );

  try {
    // 1) Verify all Phase 3 ContextMenus registered & execute cleanly
    const cleanMenu = menus.find((m) => m.name === "Copy Clean Link (no ?si=)");
    const ytMenu = menus.find((m) => m.name === "Watch Music Video (YouTube)");
    const trashMenu = menus.find((m) => m.name === "Trash & Smart-Skip Track");
    assert.ok(cleanMenu && ytMenu && trashMenu, "All 3 Phase 3 context menus must register");

    cleanMenu.onClick(TRACK_A);
    assert.equal(clipboard.at(-1), "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");

    await ytMenu.onClick(TRACK_A);
    assert.ok(
      navigations.some((n) => n.target === "external" && n.uri.startsWith("https://www.youtube.com/results?search_query=")),
      "Watch Music Video should open YouTube external search",
    );

    // 2) Mount sideDrawer UI and configure Smart Auto-Skip (enable Auto-Trash N=2 & Live preset)
    const drawerEntry = [...registry.sideDrawerItems.values()][0];
    assert.ok(drawerEntry, "Queue & Bookmarks+ sideDrawer entry must exist");
    let drawerTree;
    setCommitListener("sideDrawer", (tree) => {
      drawerTree = tree;
    });
    registry.emitSideDrawerPress(drawerEntry.scriptId, drawerEntry.id);

    const until = async (pred) => {
      for (let i = 0; i < 200; i++) {
        drawerTree = [...registry.mountedSurfaces.values()].find((s) => s.surfaceId === "sideDrawer")?.root.getTree();
        if (pred()) {
          await delay();
          drawerTree = [...registry.mountedSurfaces.values()].find((s) => s.surfaceId === "sideDrawer")?.root.getTree();
          return;
        }
        await delay();
      }
      assert.fail("Timed out waiting for sideDrawer predicate");
    };
    const findBtn = (label) =>
      nodes(drawerTree).find((n) => n.props?.onPress?.id && text(n) === label);
    const press = (label) => {
      const b = findBtn(label);
      assert.ok(b, `Missing button: ${label}`);
      dispatchReactEvent(b.props.onPress.id, { surfaceId: "sideDrawer" });
    };

    await until(() => text(drawerTree).includes("Up-Next Peek (Phase 3.5)"));
    assert.ok(text(drawerTree).includes("Smart Auto-Skip & Trashbin (Phase 3.6)"));
    assert.ok(text(drawerTree).includes("NowPlaying Badges & Spotify Code (Phase 3.8)"));

    press("Auto-Trash Skipped: OFF");
    await until(() => Boolean(findBtn("-1")));
    press("-1"); // Threshold 3 -> 2
    await until(() => text(drawerTree).includes("Auto-trash after 2 manual skips"));
    press("Live / Concert versions");
    await until(() => Boolean(findBtn("Live / Concert versions ✓")));

    // 3) Exercise manual skip auto-trash & Smart Skip loop guard via songChanged emitter
    const emitSongChanged = (payload) =>
      registry.broadcastSpotifyEvent("songChanged", payload);

    await emitSongChanged({ uri: TRACK_A, previousUri: TRACK_B, reason: "skip-next", reasonSource: "command" });
    await delay();
    await emitSongChanged({ uri: TRACK_A, previousUri: TRACK_B, reason: "skip-next", reasonSource: "command" });
    await until(() => toasts.some((t) => t.includes("Auto-trashed")));

    // Playing trashed track B now triggers Smart Skip
    const skipsBefore = skipCount;
    await emitSongChanged({ uri: TRACK_B, previousUri: TRACK_A, reason: "track-ended", reasonSource: "command" });
    await delay();
    await delay();
    assert.equal(skipCount, skipsBefore + 1, "Trashed track must trigger auto-skip");

    // 4) Verify 5-skip loop guard stops runaway skipping
    const baseSkips = skipCount;
    for (let i = 0; i < 6; i++) {
      await emitSongChanged({ uri: TRACK_LIVE, previousUri: TRACK_A, reason: "track-ended", reasonSource: "command" });
      await delay();
    }
    assert.ok(skipCount - baseSkips <= 5, `Loop guard must cap rapid skips at 5 (got ${skipCount - baseSkips})`);
    assert.ok(toasts.some((t) => t.includes("Smart Skip paused 15s")));

    // 5) Mount actual nowPlaying.page UI overlay and exercise +BM & Code panel
    ui.open({
      id: "np-instance-1",
      target: "nowPlaying.page",
      context: { uri: TRACK_A, title: activeTrack.title, subtitle: activeTrack.artist },
      operations: ["replace", "overlay"],
      layout: "fill",
      nativeContent: true,
    });
    const overlaySurfaceId = "target:np-instance-1";
    const readOverlayTree = () => ui.targets.get("np-instance-1")?.root?.getTree() || surfaces.get(overlaySurfaceId)?.tree || null;
    for (let i = 0; i < 150; i++) {
      if (text(readOverlayTree() || {}).includes("1987")) break;
      await delay();
    }
    const overlayTree = readOverlayTree();
    const overlayTxt = text(overlayTree);
    assert.ok(overlayTxt.includes("1987") && overlayTxt.includes("+BM") && overlayTxt.includes("Code"), `Unexpected overlay text: ${overlayTxt}`);

    const bmBtn = nodes(overlayTree).find((n) => n.props?.onPress?.id && text(n) === "+BM");
    assert.ok(bmBtn, "+BM quick button missing in overlay");
    dispatchReactEvent(bmBtn.props.onPress.id, { surfaceId: overlaySurfaceId });
    await delay();
    assert.ok(toasts.some((t) => t.startsWith("Bookmarked @")), "Quick +BM must save bookmark");

    const codeBtn = nodes(readOverlayTree()).find((n) => n.props?.onPress?.id && text(n) === "Code");
    assert.ok(codeBtn, "Code button missing in overlay");
    dispatchReactEvent(codeBtn.props.onPress.id, { surfaceId: overlaySurfaceId });
    for (let i = 0; i < 80; i++) {
      if (text(readOverlayTree() || {}).includes("Scannable Spotify Code")) break;
      await delay();
    }
    assert.ok(text(readOverlayTree()).includes("Scannable Spotify Code"));
    assert.ok((surfaces.get(overlaySurfaceId)?.ops?.length || 0) > 0, "Expected overlay React commit ops");
    assert.equal(errors.length, 0, `Unexpected runtime errors: ${JSON.stringify(errors)}`);
  } finally {
    ui.close("np-instance-1");
    registry.unregisterScript("com.wamako.bookmarksplus");
  }
});
