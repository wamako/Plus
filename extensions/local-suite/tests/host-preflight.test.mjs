import { collectionResponse } from "./fixtures/collection.mjs";
import { LIKED_URI } from "../shared/liked-songs.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Module from "node:module";
import { uriToHex } from "../shared/native-metadata.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = await fs.realpath(
  process.env.SPOTIFYPLUS_SDK_SOURCE ||
    path.join(root, "node_modules/spotifyplus"),
);
process.env.NODE_PATH = path.join(sdk, "node_modules");
Module._initPaths();
const runtimeRoot = path.resolve(sdk, "../nodejs");
const { ScriptLoader } = await import(
  pathToFileURL(path.join(runtimeRoot, "loader/script-loader.js"))
);
const { ScriptRegistry } = await import(
  pathToFileURL(path.join(runtimeRoot, "loader/script-registry.js"))
);
const { setCommitListener, clearCommitListener, dispatchReactEvent } =
  await import(pathToFileURL(path.join(runtimeRoot, "ui/renderer.js")));
const id = (n) => String(n).padStart(22, "0"),
  uri = (n) => `spotify:track:${id(n)}`;
const album = {
  name: "Album",
  uri: `spotify:album:${id(4)}`,
  release_date: "2020-04-01",
};
const tracks = [1, 2, 3].map((n) => ({
  uri: uri(n),
  name: `Song ${n}`,
  artists: [{ id: id(n), uri: `spotify:artist:${id(n)}`, name: `Artist ${n}` }],
  album,
  duration_ms: 180000,
  explicit: false,
}));
const playlist = `spotify:playlist:${id(99)}`,
  copy = `spotify:playlist:${id(88)}`;
const text = (node) =>
  node?.type === "TEXT_INSTANCE"
    ? node.text
    : (node?.children || []).map(text).join(" ").replace(/\s+/g, " ").trim();
function nodes(tree) {
  return [tree, ...(tree?.children || []).flatMap(nodes)];
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(predicate, label) {
  for (let n = 0; n < 50; n++) {
    if (predicate()) return;
    await settle();
  }
  assert.fail(`Did not render ${label}`);
}

for (const mode of ["web", "native", "likes"]) {
  const nativeReads = mode !== "web",
    likedReads = mode === "likes";
  test(`actual R10 loader: ${likedReads ? "dedicated Liked Songs via paged collection" : nativeReads ? "native album/genre reads with public GET 404" : "public read fallback"}, four sandboxes and independent cleanup`, async () => {
    const errors = [],
      values = new Map(),
      http = [],
      native = [],
      worklets = new Set();
    let tree;
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
    const registry = new ScriptRegistry(logger, (...args) => errors.push(args));
    const runtime = {
      registry,
      ui: {
        forExtension() {
          return {};
        },
      },
      platformData: {
        clientVersion: "9.1.94.1929",
        osName: "Android",
        osVersion: "17",
        sdkVersion: 37,
      },
      session: { accessToken: "secret-token" },
      storageGet: (script, key) => values.get(`${script}:${key}`) ?? null,
      storageSet: (script, key, value) =>
        values.set(`${script}:${key}`, structuredClone(value)),
      storageRemove: (script, key) => values.delete(`${script}:${key}`),
      registerSideDrawer() {},
      registerContextMenu() {},
      createWorkletContext(script) {
        worklets.add(script);
        return true;
      },
      createAnimationAdapter() {
        return {};
      },
      disposeWorkletContext(script) {
        worklets.delete(script);
      },
      unregisterScript(script) {
        registry.unregisterScript(script);
        worklets.delete(script);
      },
      logScript(_script, level, args) {
        if (level === "error") errors.push(args);
      },
      callApiSync(operation, args) {
        native.push({ operation, args });
        if (operation === "player.state")
          return {
            trackUri: uri(1),
            contextUri: nativeReads && !likedReads ? album.uri : playlist,
            positionMs: 1000,
            isPlaying: true,
            isPaused: false,
            isBuffering: false,
          };
        if (operation === "clipboard.write") return;
        throw new Error(`Unexpected native operation ${operation}`);
      },
      requestApi(operation, args) {
        if (likedReads && operation === "user.get")
          return Promise.resolve({
            uri: "spotify:user:self",
            username: "self",
          });
        if (nativeReads && operation === "album.get")
          return Promise.resolve({
            name: "Native album",
            artist: [
              { name: "Artist 1", gid: uriToHex(`spotify:artist:${id(1)}`) },
            ],
            date: { year: 2020, month: 4, day: 1 },
            disc: [
              {
                number: 1,
                track: tracks.map((t) => ({ gid: uriToHex(t.uri) })),
              },
            ],
          });
        if (nativeReads && operation === "artist.get")
          return Promise.resolve({ name: "Artist 1", genre: ["hip hop"] });
        throw new Error("Unexpected native asynchronous mutation");
      },
      getCurrentTrack() {
        return {
          uri: uri(1),
          title: "Song 1",
          artist: "Artist 1",
          artists: ["Artist 1"],
          album: { title: "Album" },
          durationMs: 180000,
        };
      },
      getProgress() {
        return 1000;
      },
      getTrack: async (input) =>
        nativeReads
          ? {
              uri: input,
              title: `Song ${Number(input.split(":").at(-1))}`,
              artist: "Artist 1",
              artists: ["Artist 1"],
              album: { title: "Native album", image: "" },
              durationMs: 180000,
              explicit: false,
            }
          : null,
      closeSurface(script) {
        registry.unmountSurface(script, "sideDrawer");
        return true;
      },
      navigate(uri, target) {
        native.push({ operation: "navigate", uri, target });
      },
      sendCommand() {},
      toast() {},
      navigateBack() {},
    };
    const originalFetch = globalThis.fetch;
    let likedPages = 0;
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      http.push({ url, options });
      let result;
      if (url.hostname === "api.spotify.com") {
        assert.equal(options.headers.Authorization, "Bearer secret-token");
        if (nativeReads && options.method !== "POST")
          return new Response(JSON.stringify({ error: { status: 404 } }), {
            status: 404,
          });
        if (options.method === "POST") {
          if (url.pathname === "/v1/me/playlists") result = { uri: copy };
          else if (url.pathname === `/v1/playlists/${id(88)}/items`)
            result = { snapshot_id: "copy" };
          else if (url.pathname === "/v1/me/player/queue")
            return new Response(null, { status: 204 });
          else assert.fail(`Unexpected write ${url}`);
        } else if (url.pathname === `/v1/playlists/${id(99)}`)
          result = { name: "Original playlist" };
        else if (url.pathname === `/v1/playlists/${id(99)}/items`)
          result = {
            items: tracks.map((item) => ({ item })),
            total: 3,
            next: null,
          };
        else if (url.pathname.startsWith("/v1/tracks/"))
          result = tracks.find((t) =>
            t.uri.endsWith(url.pathname.split("/").at(-1)),
          );
        else if (url.pathname.startsWith("/v1/artists/"))
          result = { genres: ["hip hop"] };
        else assert.fail(`Unexpected read ${url}`);
      } else if (
        url.hostname === "spclient.wg.spotify.com" &&
        url.pathname === "/collection/v2/paging"
      ) {
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization, "Bearer secret-token");
        likedPages++;
        const body = Buffer.from(options.body);
        assert.ok(body.includes(Buffer.from("collection")));
        assert.ok(body.includes(Buffer.from("self")));
        const bytes =
          likedPages % 2 === 1
            ? collectionResponse(
                [{ uri: uri(1), seconds: 1700000000 }, { uri: album.uri }],
                "second",
              )
            : collectionResponse([{ uri: uri(2) }, { uri: uri(3) }]);
        return new Response(bytes, { status: 200 });
      } else if (url.hostname === "spclient.wg.spotify.com") {
        assert.equal(options.headers.Authorization, "Bearer secret-token");
        assert.ok(url.pathname.startsWith("/metadata/4/track/"));
        result = {
          name: "Song 1",
          artist: [
            { name: "Artist 1", gid: uriToHex(`spotify:artist:${id(1)}`) },
          ],
        };
      } else {
        assert.equal(options.headers?.Authorization, undefined);
        if (url.hostname === "lucasoe.github.io")
          result = {
            pageProps: {
              genresAdvancedInfo: {
                name: "Hip hop",
                description: "Test directory description",
                playlists: [id(99)],
              },
              relatedGenres: [{ genre: "rap" }],
              topArtists: [{ name: "Artist 1", id: id(1) }],
            },
          };
        else assert.fail(`Unexpected provider ${url.hostname}`);
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    setCommitListener("sideDrawer", () => {});
    const loader = new ScriptLoader(runtime, logger),
      extensionRoot = path.join(root, "build/SpotifyPlus-Local-Extensions");
    let retainedCallback;
    const press = (label) => {
      const node = nodes(tree).find(
        (n) => n.props?.onPress?.id && text(n).trim() === label,
      );
      assert.ok(node, `Missing button ${label}`);
      assert.ok(!node.props.disabled, `Disabled button ${label}`);
      dispatchReactEvent(node.props.onPress.id, { surfaceId: "sideDrawer" });
      return node.props.onPress.id;
    };
    async function open(name) {
      registry.unmountAllSurfaces("sideDrawer");
      tree = null;
      const entry = [...registry.getSideDrawerItems().values()].find(
        (e) => e.item.name === name,
      );
      assert.ok(entry);
      assert.equal(
        registry.emitSideDrawerPress(entry.scriptId, entry.id),
        true,
      );
      await settle();
      tree = [...registry.mountedSurfaces.values()]
        .find((s) => s.surfaceId === "sideDrawer")
        ?.root.getTree();
      assert.ok(tree, `No tree for ${name}`);
      assert.match(
        text(tree),
        new RegExp(name === "What’s That Genre?" ? "Genre" : name),
      );
      return entry;
    }
    try {
      for (const folder of [
        "listening-stats",
        "sort-play",
        "genres",
        "playlist-plus",
      ])
        loader.loadScript(path.join(extensionRoot, folder), "user");
      assert.equal(registry.getScripts().length, 4);
      assert.equal(registry.getSideDrawerItems().size, 4);
      assert.equal(http.length, 0, "installation performs no HTTP request");
      await open("Listening Stats");
      assert.match(text(tree), /No recorded listening/);
      press("○ Record listening locally");
      await settle();
      assert.equal(
        values.get("com.wamako.listeningstats:tracking-enabled"),
        true,
      );
      assert.equal(http.length, 0);
      await open("Sort Play");
      press(likedReads ? "Load Liked Songs" : "Load collection");
      await until(
        () => text(tree).includes("3 tracks in preview"),
        "sort preview",
      );
      assert.equal(
        http.filter(
          (c) =>
            c.options.method === "POST" && c.url.hostname === "api.spotify.com",
        ).length,
        0,
      );
      press("Preview saving a new copy");
      await until(
        () => text(tree).includes("with 3 tracks?"),
        "copy confirmation",
      );
      press("Duration");
      await until(
        () => !text(tree).includes("Confirm this action"),
        "stale confirmation invalidation",
      );
      press("Preview saving a new copy");
      await until(
        () => text(tree).includes("Confirm this action"),
        "replacement confirmation",
      );
      press("Confirm this action");
      await until(
        () => text(tree).includes("Confirmed 3 of 3"),
        "copy completion",
      );
      const writes = http.filter(
        (c) =>
          c.options.method === "POST" && c.url.hostname === "api.spotify.com",
      );
      assert.equal(writes.length, 2);
      assert.equal(JSON.parse(writes[0].options.body).public, false);
      assert.equal(writes[1].url.pathname, `/v1/playlists/${id(88)}/items`);
      press("Preview appending to queue (up to 100)");
      await until(
        () => text(tree).includes("Append 3 tracks in preview order?"),
        "queue confirmation",
      );
      press("Confirm this action");
      await until(
        () =>
          http.filter((c) => c.url.pathname === "/v1/me/player/queue")
            .length === 3,
        "queue append",
      );
      await settle();
      await open("What’s That Genre?");
      press("Look up current track");
      await until(() => text(tree).includes("Explore hip hop"), "genre lookup");
      press("Explore hip hop");
      await until(
        () => text(tree).includes("Test directory description"),
        "genre detail",
      );
      retainedCallback = press("Open genre playlist 1");
      assert.ok(
        native.some((c) => c.operation === "navigate" && c.uri === playlist),
      );
      await open("Playlist Plus");
      press(likedReads ? "Load Liked Songs" : "Load and classify genres");
      await until(
        () => text(tree).includes("hip hop · 3 (100%)"),
        "genre classification",
      );
      press("hip hop · 3 (100%)");
      await settle();
      assert.match(text(tree), /3 tracks in preview/);
      assert.equal(
        http.filter(
          (c) =>
            c.options.method === "POST" && c.url.hostname === "api.spotify.com",
        ).length,
        5,
        "classifying and filtering cause no writes",
      );
      if (nativeReads && !likedReads) {
        assert.match(text(tree), /Native album metadata/);
        assert.ok(
          http.every(
            (c) =>
              c.url.hostname !== "api.spotify.com" ||
              c.options.method === "POST",
          ),
          "native read flow never needs public GET",
        );
      }
      if (likedReads) {
        assert.match(text(tree), /Spotify saved collection/);
        assert.equal(likedPages, 4);
        assert.ok(
          http.every(
            (c) =>
              c.url.hostname !== "api.spotify.com" ||
              c.options.method === "POST",
          ),
          "likes previews do not use playlist or Web API readers",
        );
      }
      const removed = "com.wamako.genres";
      runtime.unregisterScript(removed);
      const before = native.length;
      dispatchReactEvent(retainedCallback, { surfaceId: "sideDrawer" });
      assert.equal(
        native.length,
        before,
        "stale callback from unloaded extension cannot navigate",
      );
      assert.equal(registry.getScripts().length, 3);
      assert.equal(
        registry.hasMountedSurface("sideDrawer"),
        true,
        "unloading Genres leaves Playlist Plus mounted",
      );
      await registry.emitToScript(
        "com.wamako.playlistplus",
        "android.backPressed",
        {},
      );
      assert.equal(registry.hasMountedSurface("sideDrawer"), false);
      await open("Sort Play");
      assert.match(text(tree), /Sort Play/);
    } finally {
      for (const script of [...registry.getScripts()])
        runtime.unregisterScript(script.manifest.id);
      clearCommitListener("sideDrawer");
      globalThis.fetch = originalFetch;
    }
    assert.equal(registry.getScripts().length, 0);
    assert.equal(registry.getSideDrawerItems().size, 0);
    assert.equal(registry.cleanupCallbacks.size, 0);
    assert.equal(registry.eventHandlers.size, 0);
    assert.equal(registry.extensionEventEmitters.size, 0);
    assert.equal(worklets.size, 0);
    assert.deepEqual(errors, []);
  });
}
