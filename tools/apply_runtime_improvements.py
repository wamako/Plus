"""Focused upstream 49d0a665 runtime fixes, keeping the retained native ABI."""
from pathlib import Path
import shutil
from apply_upstream_updates import change

HERE = Path(__file__).resolve().parent


def runtime(root):
    api = root / 'loader/script-api.ts'
    change(api, 'import { HostRuntime } from "./host-runtime";',
           'import { HostRuntime } from "./host-runtime";\nimport { CURRENT_SCRIPT_API } from "./script-manifest";')
    change(api, '            version: 1,', '            version: CURRENT_SCRIPT_API,')
    shutil.copy2(HERE / 'backports/r25/script-scheduler.ts', root / 'loader/script-scheduler.ts')
    loader = root / 'loader/script-loader.ts'
    change(loader, "import { resolveFetchGlobals } from './fetch-globals';",
           "import { resolveFetchGlobals } from './fetch-globals';\nimport { createScriptScheduler } from './script-scheduler';")
    text = loader.read_text()
    start = '        const timeoutHandles = new Set<any>();'
    end = '        globals.URL = URL;'
    if start in text:
        a, b = text.index(start), text.index(end, text.index(start))
        text = text[:a] + '''        const scheduler = createScriptScheduler((kind, error) => this.runtime.reportScriptError(manifest.id, `${kind} callback failed`, error));
        const { dispose: disposeScheduler, ...schedulingGlobals } = scheduler;
        Object.assign(globals, schedulingGlobals);

''' + text[b:]
        loader.write_text(text)
    elif 'const scheduler = createScriptScheduler(' not in text:
        raise RuntimeError('Pinned scheduler source changed')
    change(loader, '            registered = true;',
           '            registered = true;\n            this.runtime.registry.addCleanup(manifest.id, disposeScheduler);')
    change(loader, '            } else {\n                disposeAnimatedModule?.();',
           '            } else {\n                disposeScheduler();\n                disposeAnimatedModule?.();')
    tests = root / 'tools/tests'
    shutil.copy2(HERE / 'runtime-scheduler.test.mjs', tests / 'runtime-scheduler.test.mjs')
    package = root / 'package.json'
    change(package, 'tools/tests/navigation-compatibility.test.mjs"',
           'tools/tests/navigation-compatibility.test.mjs tools/tests/runtime-scheduler.test.mjs"')


def projects(source, upstream):
    runtime(source / 'app/src/main/assets/nodejs-src')
    tests = source / 'app/src/main/assets/nodejs-src/tools/tests'
    shutil.copy2(HERE / 'api2-advertisement.test.mjs', tests / 'api2-advertisement.test.mjs')
    package = source / 'scripts/marketplace/package.json'
    change(package, 'tools/tests/marketplace-legacy-author.test.mjs"',
           'tools/tests/marketplace-legacy-author.test.mjs ../../app/src/main/assets/nodejs-src/tools/tests/api2-advertisement.test.mjs"')
    # This host deliberately rejects future APIs, rather than storing inactive code.
    change(source / 'scripts/marketplace/src/compatibility.ts',
           "It can be installed, but it won't run until Spotify Plus is updated.",
           "Update this compatibility build before installing it.")
    settings = source / 'scripts/settings/src/app.tsx'
    change(settings, "            <AboutRow title='Marketplace version' value={MARKETPLACE_VERSION} />",
           "            <AboutRow title='Marketplace version' value={MARKETPLACE_VERSION} />\n"
           "            <AboutRow title='Extension API' value={String(SpotifyPlus.version)} />\n"
           "            <AboutRow title='Spotify version' value={SpotifyPlus.Platform.PlatformData.clientVersion || 'Unavailable'} />")

    java = source / 'app/src/main/java/com/lenerd/spotifyplus/module/scripting'
    for name in ['ScriptImageView.java', 'ScriptImageLoader.java']:
        shutil.copy2(HERE / 'backports/r25' / name, java / name)
    host = java / 'ScriptViewHost.java'
    change(host, 'return new ImageView(context);', 'return new ScriptImageView(context);')
    text = host.read_text()
    start = '    private void loadImage(RenderNode node, ImageView view, String src) {'
    end = '    private void handleImageLoadError('
    newer = (upstream / 'app/src/main/java/com/lenerd/spotifyplus/module/scripting/ScriptViewHost.java').read_text()
    a, b = text.index(start), text.index(end)
    text = text[:a] + newer[newer.index(start):newer.index(end)] + text[b:]
    host.write_text(text)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk', type=Path, required=True)
    runtime(parser.parse_args().sdk)
