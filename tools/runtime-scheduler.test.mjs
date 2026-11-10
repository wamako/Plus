import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createScriptScheduler } from '../../../nodejs/loader/script-scheduler.js';
import { ScriptLoader } from '../../../nodejs/loader/script-loader.js';
import { ScriptRegistry } from '../../../nodejs/loader/script-registry.js';

test('scheduled throws and rejected promises are reported while unrelated callbacks continue', async () => {
    const errors = [], calls = [];
    const scheduler = createScriptScheduler((kind, error) => errors.push([kind, error.message]));
    try {
        scheduler.setTimeout(() => { throw Error('timeout'); }, 0);
        scheduler.setImmediate(async () => { throw Error('immediate'); });
        scheduler.queueMicrotask(() => { throw Error('microtask'); });
        const interval = scheduler.setInterval(async () => {
            scheduler.clearInterval(interval);
            throw Error('interval');
        }, 1);
        scheduler.setTimeout((...args) => calls.push(args), 0, 'still', 'running');
        for (let n = 0; n < 100 && errors.length < 4; n++) await delay(5);
        assert.deepEqual(errors.map(v => v[0]).sort(), ['queueMicrotask', 'setImmediate', 'setInterval', 'setTimeout']);
        assert.deepEqual(calls, [['still', 'running']]);
    } finally { scheduler.dispose(); }
});

test('dispose cancels pending callbacks and rejects scheduling nonfunctions', async () => {
    const scheduler = createScriptScheduler(() => assert.fail('unexpected callback error'));
    let count = 0;
    const callback = () => count++;
    for (const name of ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']) {
        assert.throws(() => scheduler[name]('code'), /requires a function/);
        scheduler[name](callback);
    }
    scheduler.dispose();
    scheduler.dispose();
    for (const name of ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']) scheduler[name](callback);
    await delay(20);
    assert.equal(count, 0);
});

test('actual script unload and failed initialization dispose timers without removing another extension', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-scheduler-'));
    const messages = [], errors = [];
    const logger = { child() { return this; }, info() {}, warn() {}, error() {} };
    const registry = new ScriptRegistry(logger);
    const runtime = { registry, ui: { forExtension() { return {}; } }, platformData: {}, session: {},
        logScript(id, level, args) { messages.push([id, ...args]); },
        reportScriptError(id, message, error) { errors.push([id, error.message]); },
        unregisterScript(id) { registry.unregisterScript(id); },
    };
    const loader = new ScriptLoader(runtime, logger);
    function load(id, code) {
        const dir = path.join(temp, id); fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, name: id, version: '1', main: 'index.js', api: 1 }));
        fs.writeFileSync(path.join(dir, 'index.js'), code);
        loader.loadScript(dir, 'user');
    }
    try {
        load('removed', "setTimeout(() => console.log('timeout'), 1); setImmediate(() => console.log('immediate')); queueMicrotask(() => console.log('microtask'));");
        runtime.unregisterScript('removed');
        assert.throws(() => load('failed', "setInterval(() => console.log('interval'), 1); setImmediate(() => console.log('immediate')); throw Error('initialization');"), /initialization/);
        load('remaining', "setTimeout(() => { throw Error('callback'); }, 0); setTimeout(() => console.log('healthy'), 1);");
        for (let n = 0; n < 100 && (!messages.length || !errors.length); n++) await delay(5);
        assert.deepEqual(messages, [['remaining', 'healthy']]);
        assert.deepEqual(errors, [['remaining', 'callback']]);
        assert.deepEqual(registry.getScripts().map(s => s.manifest.id), ['remaining']);
    } finally {
        for (const s of registry.getScripts()) runtime.unregisterScript(s.manifest.id);
        fs.rmSync(temp, { recursive: true, force: true });
    }
});
