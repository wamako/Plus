#!/usr/bin/env python3
"""Apply Wave 1 c407383 platform, SDK, diagnostics, theme, and UI-target backports."""
from pathlib import Path
import argparse
import shutil
import re
from apply_upstream_updates import change
from build_versions import VERSIONS

HERE = Path(__file__).resolve().parent

TRUST = (
    'Extensions run inside Spotify and can access its session and app data. '
    'Only install or update code from developers you trust. This is not an isolated sandbox.'
)

WAVE1_PACKAGES = (
    'diagnostics',
    'fingerprint',
    'symbols',
    'inspector',
    'scripting',
)

WAVE1_HOOKS = (
    'AndroidBackHook.java',
    'ArtworkTheme.java',
    'ComposeHeaderTarget.java',
    'ComposeRegionTargets.java',
    'ComposeReplayGuard.java',
    'EncoreAssetIcon.java',
    'HomeFeedDebugHook.java',
    'LocalExtensionHook.java',
    'MenuUITargets.java',
    'NowPlayingUITarget.java',
    'PageTargetNames.java',
    'PageUITargets.java',
    'ReactManager.java',
    'RegionUITargets.java',
    'SleepTimerHook.java',
    'SongChangeHook.java',
    'ThemeHook.java',
    'TokenOverrideController.java',
    'TokenOverridePolicy.java',
    'UiInspectorHook.java',
)


def adapt_theme_hook(theme_hook: Path) -> None:
    """Adapt upstream ThemeHook from libxposed to classic Xposed API 82."""
    change(
        theme_hook,
        'import io.github.libxposed.api.XposedModule;\n'
        'import io.github.libxposed.api.XposedModuleInterface;\n'
        'import io.github.libxposed.api.XposedInterface;',
        'import de.robv.android.xposed.XC_MethodHook;',
    )
    change(
        theme_hook,
        'private final List<XposedInterface.HookHandle> registrations = new ArrayList<>();',
        'private final List<XC_MethodHook.Unhook> registrations = new ArrayList<>();',
    )
    change(
        theme_hook,
        '    @Override\n'
        '    public void init(XposedModule module, XposedModuleInterface.PackageReadyParam param, DexKitBridge bridge) {\n'
        '        installed = this;\n'
        '        configurationFile = new AtomicFile(new File(param.getApplicationInfo().dataDir, "files/spotifyplus-theme.json"));\n'
        '        autoSeedFile = new AtomicFile(new File(param.getApplicationInfo().dataDir, "files/spotifyplus-theme-auto.json"));',
        '    public void init(String dataDir, ClassLoader loader, DexKitBridge bridge) {\n'
        '        installed = this;\n'
        '        configurationFile = new AtomicFile(new File(dataDir, "files/spotifyplus-theme.json"));\n'
        '        autoSeedFile = new AtomicFile(new File(dataDir, "files/spotifyplus-theme-auto.json"));',
    )
    change(theme_hook, 'super.init(module, param, bridge);', 'super.init(loader, bridge);')
    change(
        theme_hook,
        'for (XposedInterface.HookHandle registration : registrations) registration.unhook();',
        'for (XC_MethodHook.Unhook registration : registrations) registration.unhook();',
    )


def apply_java(source: Path, upstream: Path) -> None:
    shutil.copytree(
        upstream / 'spotifyplus-sdk/src/main/java',
        source / 'spotifyplus-sdk/src/main/java',
        dirs_exist_ok=True,
    )
    src_module = upstream / 'app/src/main/java/com/lenerd/spotifyplus/module'
    dst_module = source / 'app/src/main/java/com/lenerd/spotifyplus/module'

    for package in WAVE1_PACKAGES:
        shutil.copytree(src_module / package, dst_module / package, dirs_exist_ok=True)

    shutil.copy2(
        HERE / 'backports/wave1/NativeHooks.java',
        dst_module / 'scripting/nativestuff/NativeHooks.java',
    )
    shutil.copy2(src_module / 'Utils.java', dst_module / 'Utils.java')

    hooks_src = src_module / 'hooks'
    hooks_dst = dst_module / 'hooks'
    hooks_dst.mkdir(parents=True, exist_ok=True)
    for name in WAVE1_HOOKS:
        shutil.copy2(hooks_src / name, hooks_dst / name)

    adapt_theme_hook(hooks_dst / 'ThemeHook.java')


def apply_js_and_settings(source: Path, upstream: Path) -> None:
    nodejs = source / 'app/src/main/assets/nodejs-src'
    shutil.copytree(upstream / 'app/src/main/assets/nodejs-src', nodejs, dirs_exist_ok=True)

    settings = source / 'scripts/settings'
    shutil.copytree(upstream / 'scripts/settings', settings, dirs_exist_ok=True)

    tests = nodejs / 'tools/tests'
    shutil.copy2(HERE / 'marketplace-legacy-author.test.mjs', tests / 'marketplace-legacy-author.test.mjs')
    shutil.copy2(HERE / 'runtime-scheduler.test.mjs', tests / 'runtime-scheduler.test.mjs')
    shutil.copy2(HERE / 'api2-advertisement.test.mjs', tests / 'api2-advertisement.test.mjs')

    meta_test = tests / 'marketplace-metadata.test.mjs'
    meta_text = meta_test.read_text()
    meta_text = meta_text.replace("['Author', null, {},", "[null, {},")
    if "author: 'Legacy author'" not in meta_text:
        meta_text = meta_text.replace(
            '    for (const value of',
            "    assert.equal(schema.safeParse({ ...base, author: 'Legacy author' }).success, true);\n    for (const value of",
            1,
        )
    meta_test.write_text(meta_text)

    markdown_test = tests / 'marketplace-markdown.test.mjs'
    if markdown_test.exists():
        markdown_test.write_text(markdown_test.read_text().replace('schemaVersion, 4', 'schemaVersion, 7'))

    package_json = nodejs / 'package.json'
    if 'tools/tests/runtime-scheduler.test.mjs' not in package_json.read_text():
        change(
            package_json,
            'tools/tests/navigation-compatibility.test.mjs"',
            'tools/tests/navigation-compatibility.test.mjs tools/tests/runtime-scheduler.test.mjs"',
        )

    # Preserve legacy string manifest.author compatibility across runtime and extension-build CLI.
    change(
        nodejs / 'loader/script-manifest.ts',
        "    if (!Number.isInteger(api) || api < LEGACY_SCRIPT_API) throw new Error('manifest.api must be a positive integer');",
        "    if (!Number.isInteger(api) || api < LEGACY_SCRIPT_API) throw new Error('manifest.api must be a positive integer');\n"
        "    if (!isSupportedScriptApi(api)) throw new Error(`Unsupported manifest.api: ${api}`);",
    )
    change(
        nodejs / 'loader/script-manifest.ts',
        "    if (!Array.isArray(value)) throw new Error('manifest.author must be an array of { name, url } objects');",
        "    if (typeof value === 'string' && value.trim()) return [{ name: value.trim(), url: 'https://github.com/LeNerd46/SpotifyPlus' }];\n"
        "    if (!Array.isArray(value)) throw new Error('manifest.author must be an array of { name, url } objects');",
    )
    change(
        nodejs / 'tools/extension-build.mjs',
        "        if (!Array.isArray(manifest.author)) throw new Error('manifest.author must be an array of { name, url } objects');",
        "        if (typeof manifest.author === 'string' && manifest.author.trim()) return manifest;\n"
        "        if (!Array.isArray(manifest.author)) throw new Error('manifest.author must be an array of { name, url } objects');",
    )
    change(
        nodejs / 'tools/tests/extension-build.test.mjs',
        "    for (const author of ['Author', null, 42,",
        "    for (const author of ['', null, 42,",
    )

    app_tsx = settings / 'src/app.tsx'
    app_text = app_tsx.read_text()
    app_text, count = re.subn(
        r"const SPOTIFY_PLUS_VERSION = '[^']+';",
        f"const SPOTIFY_PLUS_VERSION = '{VERSIONS['moduleVersion']}';",
        app_text,
    )
    if count != 1:
        raise RuntimeError('Wave 1 settings version anchor changed')
    app_tsx.write_text(app_text)

    change(
        app_tsx,
        'Choose a folder for your locally installed extensions. The extensions should be folders with a manifest.json.',
        'Choose a folder of unpacked extensions. ' + TRUST + ' Selecting or refreshing it runs its code.',
    )
    change(
        app_tsx,
        "            <AboutRow title='Marketplace version' value={MARKETPLACE_VERSION} />",
        "            <AboutRow title='Marketplace version' value={MARKETPLACE_VERSION} />\n"
        "            <AboutRow title='Extension API' value={String(SpotifyPlus.version)} />\n"
        "            <AboutRow title='Spotify version' value={SpotifyPlus.Platform.PlatformData.clientVersion || 'Unavailable'} />",
    )
    change(
        app_tsx,
        "<AboutLink title='GitHub' onPress={() => SpotifyPlus.Navigation.open('https://github.com/LeNerd46/SpotifyPlus')} />",
        "<AboutLink title='Compatibility build updates' onPress={() => SpotifyPlus.Navigation.open('https://github.com/wamako/Plus/pull/2')} />\n"
        "            <Text style={{ color: '#b3b3b3', fontSize: 13, paddingHorizontal: 12, marginBottom: 16 }}>"
        "Updates for this Spotify 9.1.94.1929 build are reviewed manually. Upstream APKs may require a different Spotify version."
        "</Text>\n"
        "            <AboutLink title='Upstream project' onPress={() => SpotifyPlus.Navigation.open('https://gitlab.com/LeNerd46/spotify-plus')} />",
    )


def apply(source: Path, upstream: Path) -> None:
    apply_java(source, upstream)
    apply_js_and_settings(source, upstream)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    args = parser.parse_args()
    apply(args.source, args.upstream)
