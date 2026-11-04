#!/usr/bin/env python3
"""Build the pinned API-2 runtime; retain the legacy module and verified 9.1.94 hooks."""
import argparse, hashlib, json, pathlib, shutil, subprocess, tarfile, tempfile, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
UPSTREAM = '615455bf0a7a81cd2d01382a1f1e9e0a699fb082'
RUNTIME_URL = 'https://github.com/LeNerd46/SpotifyPlus/releases/download/v0.10-preview-1/spotifyplus-0.10.0-preview-1.apk'
RUNTIME_SHA = 'd94cabfe0f6fdeb07a81da60030bf8e63eab4c3a5339bc99fcda81028788cf48'
LYRICS = '6e60d0a038149c2df72664275d35beb2916cafd1'

def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=90) as response, path.open('wb') as target:
        shutil.copyfileobj(response, target)

def archive(owner, repo, commit, destination):
    if destination.is_dir(): return
    with tempfile.TemporaryDirectory() as tmp:
        package = pathlib.Path(tmp) / 'source.tar.gz'
        download(f'https://codeload.github.com/{owner}/{repo}/tar.gz/{commit}', package)
        with tarfile.open(package) as source:
            source.extractall(pathlib.Path(tmp) / 'extracted', filter='data')
        source = next((pathlib.Path(tmp) / 'extracted').iterdir())
        shutil.copytree(source, destination)

def replace(path, old, new):
    text = path.read_text()
    if old not in text and new in text: return
    if old not in text: raise RuntimeError(f'Pinned source shape changed: {path.name}: {old[:70]}')
    path.write_text(text.replace(old, new))

def run(command, directory): subprocess.run(command, cwd=directory, check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path)
    parser.add_argument('--runtime-apk', type=pathlib.Path)
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
    runtime=args.runtime_apk or cache/'upstream.apk'
    if not runtime.exists(): download(RUNTIME_URL,runtime)
    with runtime.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    if digest != RUNTIME_SHA: raise RuntimeError('Upstream runtime APK checksum mismatch')
    with zipfile.ZipFile(runtime) as apk:
        node=apk.read('lib/arm64-v8a/libnode.so')
        if b'v18.20.4' not in node: raise RuntimeError('Node binary/header version mismatch')
        out=source/'app/libnode/bin/arm64-v8a/libnode.so';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(node)
    generated=ROOT/'app/api2-generated/java'
    if generated.exists():shutil.rmtree(generated)
    generated.mkdir(parents=True)
    java=source/'app/src/main/java'
    for relative in ['com/lenerd/spotifyplus/module/scripting','com/lenerd/spotifyplus/sdk']:
        origin=java/relative if 'module/' in relative else source/'spotifyplus-sdk/src/main/java'/relative
        shutil.copytree(origin,generated/relative,dirs_exist_ok=True)
    selected=['module/Utils.java','module/hooks/ReactManager.java','module/hooks/LocalExtensionHook.java','module/hooks/NowPlayingUITarget.java',
              'manager/bridge/BridgeMessageBus.java','manager/bridge/BridgeMessageListener.java']
    for relative in selected:
        dest=generated/'com/lenerd/spotifyplus'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(java/'com/lenerd/spotifyplus'/relative,dest)
    for path in generated.rglob('*.java'):
        text=path.read_text().replace('import com.lenerd.spotifyplus.R;\n','').replace('import com.lenerd.spotifyplus.manager.bridge.BridgeClient;\n','').replace('import com.lenerd.spotifyplus.manager.bridge.BridgeRouter;\n','')
        text=text.replace('com.lenerd.spotifyplus.BuildConfig','com.lenerd46.spotifyplus.BuildConfig')
        path.write_text(text)
    utils=generated/'com/lenerd/spotifyplus/module/Utils.java'
    replace(utils,'classLoader.loadClass("p.ibl0").getMethod("c")','wrapper.getClass().getMethod("c")')
    replace(utils,'classLoader.loadClass("p.ibl0").getMethod("b")','wrapper.getClass().getMethod("b")')
    replace(utils,'Class<?> optional = state.getClass().getClassLoader().loadClass("p.ibl0");\n            Object position = model.getMethod("positionAsOfTimestamp").invoke(state);','Object position = model.getMethod("positionAsOfTimestamp").invoke(state);\n            if (position == null) return -1;\n            Class<?> optional = position.getClass();')
    targets=generated/'com/lenerd/spotifyplus/module/scripting/UITargets.java'
    replace(targets,'"9.1.82.2160".equals(spotifyVersion)','"9.1.94.1929".equals(spotifyVersion)')
    manager=generated/'com/lenerd/spotifyplus/module/scripting/ScriptManager.java'
    replace(manager,'                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnative-lib.so");\n                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnode.so");','                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnode.so");\n                extractAndLoad(Utils.MODULE_APK_PATH, outDir, "libnative-lib.so");')
    replace(manager,'        Log.i("SpotifyPlus", "Message from node: " + json);','        // Bridge messages can contain session data; do not log their payloads.')
    services=generated/'com/lenerd/spotifyplus/module/scripting/SpotifyServices.java'
    replace(services,'if (value != null && type("p.v8f").isInstance(value) && (Boolean) call(value, "c")) {\n            throw new IllegalStateException(String.valueOf(call(call(value, "a"), "g")));\n        }','if (value != null && String.valueOf(value).startsWith("Failure")) throw new IllegalStateException(String.valueOf(value));')
    start=services.read_text().index('    private synchronized Object queue() throws Exception {')
    end=services.read_text().index('    private JSONArray tracks(',start)
    content=services.read_text()
    services.write_text(content[:start]+'''    private synchronized Object queue() throws Exception {
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
    archive('LeNerd46','beautiful-lyrics-spotify-plus',LYRICS,lyrics)
    fixture=source/'scripts/lyrics'; fixture.mkdir(exist_ok=True)
    shutil.copy2(lyrics/'dist/lyrics.apk',fixture/'lyrics.apk')
    shutil.copy2(lyrics/'dist/manifest.json',fixture/'manifest.json')
    replace(services,'private Object field(Object value, String name) throws Exception { return value.getClass().getField(name).get(value); }',
        'private Object field(Object value, String name) throws Exception { for (Class<?> type=value.getClass(); type!=null; type=type.getSuperclass()) { try { Field f=type.getDeclaredField(name); f.setAccessible(true); return f.get(value); } catch (NoSuchFieldException ignored) {} } throw new NoSuchFieldException(name); }')
    replace(source/'scripts/marketplace/src/fetch-metadata.ts',
        "JSON.parse(SpotifyPlus.Platform.Storage.Cache.read(`${user}-${repo}`) as string ?? 'null')",
        "JSON.parse(await SpotifyPlus.Platform.Storage.Cache.read(`${user}-${repo}`) as string ?? 'null')")
    runtime_source=source/'app/src/main/assets/nodejs-src' 
    if not args.no_js_build:
        run(['npm','ci','--ignore-scripts'],runtime_source)
        run(['npm','run','build'],runtime_source)
        run(['npm','test'],runtime_source)
        run(['npm','run','test:ui'],runtime_source)
        run(['npm','run','test:native'],runtime_source)
        for name in ['marketplace','settings']:
            project=source/'scripts'/name
            run(['npm','ci','--ignore-scripts'],project)
            run(['npm','run','build'],project)
            if name == 'marketplace': run(['npm','test'],project)
    assets=ROOT/'app/api2-assets'
    if assets.exists():shutil.rmtree(assets)
    shutil.copytree(source/'app/src/main/assets/nodejs',assets/'nodejs')
    # Never ship the upstream development test scripts or example token logging.
    for relative in ['scripts','scriptss','elevated/lyrics','elevated/liquid-glass','elevated/ui-showcase']:
        shutil.rmtree(assets/'nodejs'/relative,ignore_errors=True)
    lyrics=cache/f'lyrics-{LYRICS}'
    archive('LeNerd46','beautiful-lyrics-spotify-plus',LYRICS,lyrics)
    shutil.copytree(lyrics/'dist',assets/'api2-extensions/beautiful-lyrics')
    shutil.copy2(lyrics/'LICENSE',assets/'api2-extensions/beautiful-lyrics/LICENSE')
    manifest=json.loads((assets/'api2-extensions/beautiful-lyrics/manifest.json').read_text())
    bundle=assets/'api2-extensions/beautiful-lyrics'
    if manifest.get('main') == 'dist/index.js' and (bundle/'index.js').is_file(): manifest['main']='index.js'
    native=manifest.get('native',{})
    if native.get('apk') == 'dist/lyrics.apk' and (bundle/'lyrics.apk').is_file(): native['apk']='lyrics.apk'
    (bundle/'manifest.json').write_text(json.dumps(manifest,indent=2))
    if manifest.get('api')!=2 or not (bundle/manifest['main']).is_file() or not (bundle/native['apk']).is_file():raise RuntimeError('Invalid Beautiful Lyrics bundle')
    print('Prepared pinned API-2 runtime, marketplace, extension settings and Beautiful Lyrics')

if __name__=='__main__':main()
