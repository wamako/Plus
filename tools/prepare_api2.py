#!/usr/bin/env python3
"""Build the pinned API-2 runtime; retain the legacy module and verified 9.1.94 hooks."""
import argparse, hashlib, json, re, pathlib, shutil, subprocess, sys, tarfile, tempfile, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
UPSTREAM = '615455bf0a7a81cd2d01382a1f1e9e0a699fb082'
RUNTIME_SHA = 'd94cabfe0f6fdeb07a81da60030bf8e63eab4c3a5339bc99fcda81028788cf48'
R11_SHA = '176aac1fec257cf18b7f2fc002f5cad2be2f9cc774a69694094e34555abb5df2'
NODE_SHA = 'ce00e709fe6b84c5a57b48cbcba8549cf594d752d386a93a8b2c6b76fb9d021a'
LYRICS = '6e60d0a038149c2df72664275d35beb2916cafd1'
LYRICS_WAVE1 = '83238365a111503e55f1be71ff376e4806af6dc3'
PLAY_NEXT = '1f46c661117f76f5914387071fb804db16514878'

def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=90) as response, path.open('wb') as target:
        shutil.copyfileobj(response, target)

def archive(owner, repo, commit, destination):
    if destination.is_dir(): return
    with tempfile.TemporaryDirectory() as tmp:
        package = pathlib.Path(tmp) / 'source.tar.gz'
        url = (f'https://gitlab.com/LeNerd46/spotify-plus/-/archive/{commit}/spotify-plus-{commit}.tar.gz'
               if repo == 'SpotifyPlus' else f'https://codeload.github.com/{owner}/{repo}/tar.gz/{commit}')
        download(url, package)
        with tarfile.open(package) as source:
            source.extractall(pathlib.Path(tmp) / 'extracted', filter='data')
        source = next((pathlib.Path(tmp) / 'extracted').iterdir())
        shutil.copytree(source, destination)

def replace(path, old, new):
    text = path.read_text()
    if old not in text and new in text: return
    if old not in text: raise RuntimeError(f'Pinned source shape changed: {path.name}: {old[:70]}')
    path.write_text(text.replace(old, new))

def run(command, directory): subprocess.run([shutil.which(command[0]) or command[0], *command[1:]], cwd=directory, check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path)
    inputs=parser.add_mutually_exclusive_group()
    inputs.add_argument('--runtime-apk', type=pathlib.Path, help='Explicit legacy recovery from the verified R11 or original preview APK')
    inputs.add_argument('--binary-inputs', type=pathlib.Path, help='Retained checksum-pinned Node/Lyrics bundle (downloaded if absent)')
    parser.add_argument('--no-js-build', action='store_true')
    args=parser.parse_args()
    cache=ROOT/'.api2-cache'; cache.mkdir(exist_ok=True)
    source=ROOT/'app/api2-source'
    if not source.exists():
        if args.source:
            source.mkdir()
            for relative in ['app/libnode/include','app/src/main/cpp','app/src/main/assets/nodejs-src','scripts/marketplace','scripts/settings','spotifyplus-sdk/src/main/java','app/src/main/java']:
                shutil.copytree(args.source/relative,source/relative,dirs_exist_ok=True)
        else: archive('LeNerd46','SpotifyPlus',UPSTREAM,source)
    updates=cache/'upstream-updates-c407383'
    archive('LeNerd46','SpotifyPlus','c407383820660d4273703f53d517ce12beced77e',updates)
    if 'parseAuthors' not in (source/'app/src/main/assets/nodejs-src/loader/script-manifest.ts').read_text():
        run([sys.executable,str(ROOT/'tools/apply_upstream_updates.py'),'--source',str(source),'--upstream',str(updates)],ROOT)
        from apply_compatibility_ui import apply as apply_compatibility_ui
        apply_compatibility_ui(source)
        from apply_runtime_improvements import projects as apply_runtime_improvements
        apply_runtime_improvements(source, updates)
    from apply_wave1_updates import apply as apply_wave1_updates
    apply_wave1_updates(source, updates)
    from apply_wave2_updates import apply as apply_wave2_updates
    apply_wave2_updates(source)
    cpp=source/'app/src/main/cpp/spotifyengine.cpp'
    replace(cpp, '#include "spotifyengine.h"', '#include <unistd.h>\n#include "spotifyengine.h"')
    runtime=args.runtime_apk
    lyrics=cache/f'lyrics-{LYRICS}'
    if runtime is not None:
        with runtime.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
        if digest not in {RUNTIME_SHA, R11_SHA}: raise RuntimeError('Runtime donor APK checksum mismatch')
        with zipfile.ZipFile(runtime) as apk:
            node=apk.read('lib/arm64-v8a/libnode.so')
    else:
        from runtime_inputs import ensure_bundle, install_bundle, load_spec
        spec=load_spec()
        if spec['entries']['node/arm64-v8a/libnode.so']['sha256'] != NODE_SHA:
            raise RuntimeError('Runtime manifest changed the preserved ARM Node donor')
        bundle=args.binary_inputs or cache/'runtime-inputs/runtime-inputs.zip'
        ensure_bundle(bundle,spec)
        install_bundle(bundle,source,lyrics,spec)
        node=(source/'app/libnode/bin/arm64-v8a/libnode.so').read_bytes()
        digest=R11_SHA
    if hashlib.sha256(node).hexdigest() != NODE_SHA: raise RuntimeError('Node binary checksum mismatch')
    if b'v18.20.4' not in node: raise RuntimeError('Node binary/header version mismatch')
    if runtime is not None:
        out=source/'app/libnode/bin/arm64-v8a/libnode.so';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(node)
    generated=ROOT/'app/api2-generated/java'
    if generated.exists():shutil.rmtree(generated)
    generated.mkdir(parents=True)
    java=source/'app/src/main/java'
    for relative in ['com/lenerd/spotifyplus/module/scripting','com/lenerd/spotifyplus/module/diagnostics','com/lenerd/spotifyplus/module/fingerprint','com/lenerd/spotifyplus/module/symbols','com/lenerd/spotifyplus/module/inspector','com/lenerd/spotifyplus/sdk']:
        origin=java/relative if 'module/' in relative else source/'spotifyplus-sdk/src/main/java'/relative
        shutil.copytree(origin,generated/relative,dirs_exist_ok=True)
    selected=['module/Utils.java','module/hooks/AndroidBackHook.java','module/hooks/ArtworkTheme.java','module/hooks/ComposeHeaderTarget.java','module/hooks/ComposeRegionTargets.java','module/hooks/ComposeReplayGuard.java','module/hooks/EncoreAssetIcon.java','module/hooks/HomeFeedDebugHook.java','module/hooks/LocalExtensionHook.java','module/hooks/MenuUITargets.java','module/hooks/NowPlayingUITarget.java','module/hooks/PageTargetNames.java','module/hooks/PageUITargets.java','module/hooks/ReactManager.java','module/hooks/RegionUITargets.java','module/hooks/SleepTimerHook.java','module/hooks/SongChangeHook.java','module/hooks/StorageHook.java','module/hooks/ThemeHook.java','module/hooks/TokenOverrideController.java','module/hooks/TokenOverridePolicy.java','module/hooks/UiInspectorHook.java',
              'manager/bridge/BridgeMessageBus.java','manager/bridge/BridgeMessageListener.java']
    for relative in selected:
        dest=generated/'com/lenerd/spotifyplus'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(java/'com/lenerd/spotifyplus'/relative,dest)
    for path in generated.rglob('*.java'):
        text=path.read_text().replace('import com.lenerd.spotifyplus.R;\n','').replace('import com.lenerd.spotifyplus.manager.bridge.BridgeClient;\n','').replace('import com.lenerd.spotifyplus.manager.bridge.BridgeRouter;\n','')
        text=text.replace('com.lenerd.spotifyplus.BuildConfig','com.lenerd46.spotifyplus.BuildConfig')
        path.write_text(text)
    utils=generated/'com/lenerd/spotifyplus/module/Utils.java'
    replace(utils, 'imageId == null ? null : imageId.replace("spotify:image:", "https://i.scdn.co/image/")', 'com.lenerd46.spotifyplus.ArtworkSource.url(imageId)')
    manager=generated/'com/lenerd/spotifyplus/module/scripting/ScriptManager.java'
    replace(manager,'                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnative-lib.so");\n                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnode.so");','                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libc++_shared.so");\n                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnode.so");\n                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnative-lib.so");')
    replace(manager,'        Log.i("SpotifyPlus", "Message from node: " + json);','        // Bridge messages can contain session data; do not log their payloads.')
    replace(manager,
        '            ScriptViewHost.preloadNativeLibraries(activity.getApplicationContext());\n            SpotifyNativeBridge bridge = new SpotifyNativeBridge(activity.getClassLoader(), marketplaceScripts, optimizedDirectory, activity);\n            initializeNativeBridge(bridge, new String[] { "node", hostFile.getAbsolutePath(), hostConfig.toString() });',
        '            try {\n                ScriptViewHost.preloadNativeLibraries(activity.getApplicationContext());\n                SpotifyNativeBridge bridge = new SpotifyNativeBridge(activity.getClassLoader(), marketplaceScripts, optimizedDirectory, activity);\n                if (!initializeNativeBridge(bridge, new String[] { "node", hostFile.getAbsolutePath(), hostConfig.toString() })) throw new IllegalStateException("Native extension bridge could not initialize");\n            } catch (Throwable error) { com.lenerd46.spotifyplus.api2.Api2Runtime.startFailed(error); }')
    replace(manager, '            Log.e("SpotifyPlus", "Failed to load host JS script", e);',
        '            Log.e("SpotifyPlus", "Failed to load host JS script", e);\n            com.lenerd46.spotifyplus.api2.Api2Runtime.startFailed(e);')
    # Seal extracted code before writing; Android 17 rejects writable native libraries.
    for loader in [manager, generated/'com/lenerd/spotifyplus/module/scripting/ScriptViewHost.java']:
        content=loader.read_text()
        start=content.index('    private static void extractEntry(String apkPath, ZipEntry entry, File outFile) throws Exception {')
        end=content.index('\n    }',start)+len('\n    }')
        content=content[:start]+'''    private static void extractEntry(String apkPath, ZipEntry entry, File outFile) throws Exception {
        try (ZipFile zip = new ZipFile(apkPath); InputStream in = zip.getInputStream(entry)) {
            com.lenerd46.spotifyplus.api2.ReadOnlyCodeFiles.write(in, outFile);
        }
    }'''+content[end:]
        # Recreate native renderer caches as well, including old writable R7 files.
        content=content.replace('if (!isCachedLibraryUsable(outFile, entry)) extractEntry(apkPath, entry, outFile);', 'extractEntry(apkPath, entry, outFile);')
        loader.write_text(content)
    content=manager.read_text()
    start=content.index('            if (outFile.exists()) {',content.index('private void getAssetFolder'))
    end=content.index('            return;',start)
    content=content[:start]+'''            try (InputStream in = assetManager.open(assetPath)) {
                com.lenerd46.spotifyplus.api2.ReadOnlyCodeFiles.write(in, outFile);
            }
'''+content[end:]
    start=content.index('        try (InputStream in = assetManager.open(assetPath); FileOutputStream out = new FileOutputStream(dest))',content.index('private void copyNodeAddon'))
    end=content.index('\n    public void testPing()',start)
    content=content[:start]+'''        try (InputStream in = assetManager.open(assetPath)) {
            com.lenerd46.spotifyplus.api2.ReadOnlyCodeFiles.write(in, dest);
        }
    }
'''+content[end:]
    manager.write_text(content)
    services=generated/'com/lenerd/spotifyplus/module/scripting/SpotifyServices.java'
    replace(services, '    public Object execute(String operation, JSONObject args) throws Exception {', '''    public Object execute(String operation, JSONObject args) throws Exception {
        if (operation.startsWith("shuffleplus.")) return com.lenerd46.spotifyplus.api2.ShufflePlusBridge.execute(loader, operation, args);
        if (operation.startsWith("liked.")) return com.lenerd46.spotifyplus.api2.NativeLikedSongsBridge.execute(operation, args);''')
    replace(services, '    private Object modifyPlaylist(String operation, JSONObject args) throws Exception {', '''    private Object modifyPlaylist(String operation, JSONObject args) throws Exception {
        // 9.1.94 changed the generated builder aliases and creation-origin enum.
        if (operation.equals("playlists.create")) {
            String name = args.getString("name").trim();
            String uri = new com.lenerd46.spotifyplus.api2.NativePlaylistWriter(loader, PlayerHook.core).create(name);
            return new JSONObject().put("uri", uri).put("name", name);
        }
        if (operation.equals("playlists.addTracks")) {
            new com.lenerd46.spotifyplus.api2.NativePlaylistWriter(loader, PlayerHook.core)
                .addTracks(args.getString("uri"), strings(args.getJSONArray("uris")));
            return JSONObject.NULL;
        }''')
    replace(services,'await(resolve(PlayerSymbols.CONTEXT_PLAYER_PLAY).invoke(ready(PlayerHook.contextPlayer), call(builder, "build")));',
        'Object target = ready(PlayerHook.contextPlayer);\n                await(com.lenerd46.spotifyplus.api2.NativePlaybackCommand.dispatcher(loader, target.getClass()).invoke(target, call(builder, "build")));')
    replace(services,'        if (value != null && resolve(CoreSymbols.PLAYER_RESULT_FAILURE).isInstance(value)) {\n            throw new IllegalStateException(String.valueOf(resolve(CoreSymbols.PLAYER_RESULT_FAILURE_REASON).get(value)));\n        }',
        '        if (value != null && String.valueOf(value).startsWith("Failure")) throw new IllegalStateException(String.valueOf(value));')
    start=services.read_text().index('    private synchronized Object queue() throws Exception {')
    end=services.read_text().index('    private synchronized void observeQueue() {',start)
    content=services.read_text()
    services.write_text(content[:start]+'''    private Object field(Object value, String name) throws Exception {
        for (Class<?> type = value.getClass(); type != null; type = type.getSuperclass()) {
            try { Field f = type.getDeclaredField(name); f.setAccessible(true); return f.get(value); } catch (NoSuchFieldException ignored) {}
        }
        throw new NoSuchFieldException(name);
    }
    private synchronized Object queue() throws Exception {
        Object repository = com.lenerd46.spotifyplus.player.NextUpQueue.currentRepository();
        if (repository == null) throw new IllegalStateException("Spotify queue is not ready");
        return repository;
    }
    private Object queueState() throws Exception {
        Object stream = field(queue(), "c");
        Class<?> single = type("io.reactivex.rxjava3.core.Single");
        java.util.List<Method> readers = java.util.Arrays.stream(stream.getClass().getMethods())
            .filter(m -> !Modifier.isStatic(m.getModifiers()) && m.getParameterCount() == 0 && single.isAssignableFrom(m.getReturnType())).toList();
        if (readers.size() != 1) throw new IllegalStateException("Ambiguous queue snapshot reader");
        return await(readers.get(0).invoke(stream));
    }
'''+content[end:])
    lyrics=cache/f'lyrics-{LYRICS}'
    lyrics_wave1=cache/f'lyrics-{LYRICS_WAVE1}'
    if runtime is not None and digest == R11_SHA:
        # Preserve the exact already-validated extension after upstream's GitHub
        # repository migration. The entire donor APK was verified above.
        prefix='assets/api2-extensions/beautiful-lyrics/'
        with zipfile.ZipFile(runtime) as apk:
            for name in apk.namelist():
                if name.startswith(prefix) and not name.endswith('/'):
                    relative=pathlib.PurePosixPath(name[len(prefix):])
                    if '..' in relative.parts or relative.is_absolute(): raise RuntimeError('Invalid donor path')
                    destination=lyrics/'dist'/relative
                    destination.parent.mkdir(parents=True,exist_ok=True)
                    destination.write_bytes(apk.read(name))
        shutil.copy2(lyrics/'dist/LICENSE',lyrics/'LICENSE')
    elif digest != R11_SHA: archive('LeNerd46','beautiful-lyrics-spotify-plus',LYRICS,lyrics)
    archive('LeNerd24','beautiful-lyrics-spotify-plus',LYRICS_WAVE1,lyrics_wave1)
    fixture=source/'scripts/lyrics'; fixture.mkdir(exist_ok=True)
    shutil.copy2(lyrics/'dist/lyrics.apk',fixture/'lyrics.apk')
    shutil.copy2(lyrics/'dist/manifest.json',fixture/'manifest.json')
    if (lyrics_wave1/'dist/lyrics.apk').is_file(): shutil.copy2(lyrics_wave1/'dist/lyrics.apk',fixture/'lyrics.apk')
    if (lyrics_wave1/'dist/manifest.json').is_file(): shutil.copy2(lyrics_wave1/'dist/manifest.json',fixture/'manifest.json')
    runtime_source=source/'app/src/main/assets/nodejs-src'
    run(['node',str(ROOT/'extensions/local-suite/tools/patch-shuffle-sdk.mjs'),str(runtime_source)],ROOT)
    if not args.no_js_build:
        run(['npm','ci','--ignore-scripts'],runtime_source)
        run(['npm','run','build'],runtime_source)
        run(['npm','test'],runtime_source)
        run(['npm','run','test:ui'],runtime_source)
        run(['npm','run','test:native'],runtime_source)
        for name in ['marketplace','settings']:
            project=source/'scripts'/name
            run(['npm','ci','--ignore-scripts'],project)
            sdk_link=project/'node_modules/spotifyplus'
            if sdk_link.is_symlink():sdk_link.unlink()
            elif sdk_link.exists():shutil.rmtree(sdk_link)
            try:
                sdk_link.symlink_to(runtime_source.resolve(),target_is_directory=True)
            except OSError:
                shutil.copytree(runtime_source.resolve(),sdk_link)
            run(['npm','run','build'],project)
            run(['npm','run','check'],project)
            if name == 'marketplace': run(['npm','test'],project)
    assets=ROOT/'app/api2-assets'
    if assets.exists():shutil.rmtree(assets)
    shutil.copytree(source/'app/src/main/assets/nodejs',assets/'nodejs')
    # Addons are compiled and packaged separately for each Gradle variant.
    shutil.rmtree(assets/'nodejs/addons',ignore_errors=True)
    notices=assets/'upstream-notices';notices.mkdir(exist_ok=True)
    shutil.copy2(updates/'LICENSE',notices/'SpotifyPlus-MIT.txt')
    load_order=re.findall(r'extractAndLoad\(Utils.MODULE_APK_PATH, outDir, "([^"\n]+)"\)',manager.read_text())
    (assets/'api2-native-load-order.json').write_text(json.dumps(load_order))
    for name in ['marketplace','settings']:
        destination=assets/'nodejs/elevated'/name
        destination.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/'scripts'/name/'manifest.json',destination/'manifest.json')
        shutil.copytree(source/'scripts'/name/'assets',destination/'assets',dirs_exist_ok=True)
    # Never ship the upstream development test scripts or example token logging.
    for relative in ['scripts','scriptss','elevated/lyrics','elevated/liquid-glass','elevated/ui-showcase']:
        shutil.rmtree(assets/'nodejs'/relative,ignore_errors=True)
    lyrics=cache/f'lyrics-{LYRICS}'
    archive('LeNerd46','beautiful-lyrics-spotify-plus',LYRICS,lyrics)
    lyrics_wave1=cache/f'lyrics-{LYRICS_WAVE1}'
    archive('LeNerd24','beautiful-lyrics-spotify-plus',LYRICS_WAVE1,lyrics_wave1)
    # Copy only the Wave 1 dist: overlaying it on the older dist leaves both
    # frida-gadget .so and .so.gz, which fails :app:mergeDebugAssets as duplicates.
    shutil.copytree(lyrics_wave1/'dist',assets/'api2-extensions/beautiful-lyrics')
    license_src=lyrics_wave1/'LICENSE' if (lyrics_wave1/'LICENSE').is_file() else lyrics/'LICENSE'
    shutil.copy2(license_src,assets/'api2-extensions/beautiful-lyrics/LICENSE')
    from apply_wave3_updates import apply as apply_wave3_updates
    apply_wave3_updates(assets)
    manifest=json.loads((assets/'api2-extensions/beautiful-lyrics/manifest.json').read_text())
    bundle=assets/'api2-extensions/beautiful-lyrics'
    if manifest.get('main') == 'dist/index.js' and (bundle/'index.js').is_file(): manifest['main']='index.js'
    native=manifest.get('native',{})
    if native.get('apk') == 'dist/lyrics.apk' and (bundle/'lyrics.apk').is_file(): native['apk']='lyrics.apk'
    (bundle/'manifest.json').write_text(json.dumps(manifest,indent=2))
    if manifest.get('api')!=2 or not (bundle/manifest['main']).is_file() or not (bundle/native['apk']).is_file():raise RuntimeError('Invalid Beautiful Lyrics bundle')
    ext_repo=cache/f'spotifyplus-extensions-{PLAY_NEXT[:10]}'
    archive('LeNerd24','spotifyplus-extensions',PLAY_NEXT,ext_repo)
    playnext_src=ext_repo/'play-next/dist'
    playnext_dst=assets/'api2-extensions/play-next'
    shutil.copytree(playnext_src,playnext_dst)
    playnext_pkg=json.loads((ext_repo/'play-next/package.json').read_text(encoding='utf-8'))
    playnext_manifest={
        'id':'com.lenerd.playnext',
        'name':'Play Next',
        'description':'Adds a Play next action to track context menus using Spotify Plus UpNext.',
        'version':playnext_pkg.get('version','1.0.0'),
        'main':'index.js',
        'author':[{'name':'LeNerd24','url':'https://github.com/LeNerd24/spotifyplus-extensions'}],
        'api':2,
        'assets':['assets/list-start.svg'],
    }
    (playnext_dst/'manifest.json').write_text(json.dumps(playnext_manifest,indent=2)+'\n',encoding='utf-8')
    if not (playnext_dst/'index.js').is_file() or not (playnext_dst/'assets/list-start.svg').is_file():
        raise RuntimeError('Invalid Play Next bundle')
    suite_root=ROOT/'extensions/local-suite'
    if not args.no_js_build or not (suite_root/'build/SpotifyPlus-Local-Extensions/bookmarks-plus/index.js').is_file():
        run(['npm','run','build'],suite_root)
    suite_stage=assets/'api2-extensions/local-suite'
    suite_stage.mkdir(parents=True,exist_ok=True)
    suite_folders=[
        suite_root/'build/SpotifyPlus-Local-Extensions/listening-stats',
        suite_root/'build/SpotifyPlus-Local-Extensions/sort-play',
        suite_root/'build/SpotifyPlus-Local-Extensions/genres',
        suite_root/'build/SpotifyPlus-Local-Extensions/playlist-plus',
        suite_root/'build/SpotifyPlus-Local-Extensions/bookmarks-plus',
        suite_root/'build/SpotifyPlus-ShufflePlus/shuffle-plus',
    ]
    for folder in suite_folders:
        m=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        shutil.copytree(folder,suite_stage/m['id'],dirs_exist_ok=True)
    print('Prepared pinned API-2 runtime, marketplace, extension settings, Beautiful Lyrics, Play Next, and local-suite')

if __name__=='__main__':main()
