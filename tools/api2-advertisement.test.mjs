import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ScriptApiFactory } from '../../../nodejs/loader/script-api.js';
import { ScriptRegistry } from '../../../nodejs/loader/script-registry.js';
import { CURRENT_SCRIPT_API, parseManifest } from '../../../nodejs/loader/script-manifest.js';

const logger = { child() { return this; }, info() {}, warn() {}, error() {} };
const runtime = { registry: new ScriptRegistry(logger), ui: { forExtension() { return {}; } },
    platformData: { clientVersion: '9.1.94.1929' }, session: {} };
const fixture = fileURLToPath(new URL('../../../../../../../scripts/settings/', import.meta.url));
const api = new ScriptApiFactory(runtime, logger).create('api-fixture', 1, fixture, fixture, ['assets/*']).SpotifyPlus;
const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../../../../../../../scripts/marketplace/src/compatibility.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['spotifyplus'],
});
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports,
    require(name) { assert.equal(name, 'spotifyplus'); return { SpotifyPlus: api }; },
});
const { getClientApiVersion, getCompatibilityWarnings } = module.exports;
const manifest = n => ({ id: 'fixture', name: 'Fixture', main: 'index.js', version: '1.0.0', api: n });

test('Marketplace reads the real API factory and agrees with the API 2 manifest loader', () => {
    assert.equal(CURRENT_SCRIPT_API, 2);
    assert.equal(api.version, CURRENT_SCRIPT_API);
    assert.equal(getClientApiVersion(), 2);
    for (const n of [1, 2]) {
        assert.equal(parseManifest(manifest(n)).api, n);
        assert.equal(getCompatibilityWarnings({ ...manifest(n), targetSpotifyVersion: '9.1.28.x - 9.1.94.x' }).length, 0);
    }
});

test('future APIs remain rejected and real Spotify version mismatches remain visible', () => {
    assert.throws(() => parseManifest(manifest(3)), /Unsupported manifest.api/);
    const warnings = getCompatibilityWarnings(manifest(3));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /supports API 2/);
    for (const targetSpotifyVersion of ['9.1.82.2160', '>=9.2']) {
        const warnings = getCompatibilityWarnings({ ...manifest(2), targetSpotifyVersion });
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].kind, 'spotify');
    }
});

test('About displays the live extension API and Spotify version', async () => {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL('../../../../../../../scripts/settings/src/app.tsx', import.meta.url))],
        bundle: true, platform: 'node', format: 'cjs', write: false,
        external: ['spotifyplus', 'spotifyplus/*', 'react', 'react/*'],
    });
    const module = { exports: {} };
    let state = 0;
    const jsx = (type, props) => ({ type, props });
    vm.runInNewContext(bundle.outputFiles[0].text, {
        module, exports: module.exports, console,
        require(name) {
            if (name === 'spotifyplus') return { SpotifyPlus: api };
            if (name === 'react') return {
                createElement: (type, props, ...children) => jsx(type, { ...props, children }),
                useState: value => [state++ === 0 ? 'about' : typeof value === 'function' ? value() : value, () => {}],
                useMemo: fn => fn(), useEffect() {}, useRef: value => ({ current: value }),
            };
            if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
            if (name === 'spotifyplus/react/animated') return {};
            if (name === 'spotifyplus/react') return new Proxy({}, { get: (_, key) => key });
            throw Error(name);
        },
    });
    const text = node => Array.isArray(node) ? node.map(text).join(' ') :
        node && typeof node === 'object' ? text(typeof node.type === 'function' ? node.type(node.props) : node.props?.children) : String(node ?? '');
    const output = text(module.exports.default());
    assert.match(output, /Extension API\s+2/);
    assert.match(output, /Spotify version\s+9\.1\.94\.1929/);
});
