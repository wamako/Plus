type ScriptCallback = (...args: any[]) => unknown;

export function createScriptScheduler(reportError: (kind: string, error: unknown) => void) {
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const intervals = new Set<ReturnType<typeof setInterval>>();
    const immediates = new Set<ReturnType<typeof setImmediate>>();
    let disposed = false;

    function invoke(kind: string, callback: ScriptCallback, args: any[], receiver?: unknown) {
        if (disposed) return;
        try {
            const result = callback.apply(receiver, args);
            if (result && typeof (result as PromiseLike<unknown>).then === 'function') Promise.resolve(result).catch(error => reportError(kind, error));
        } catch (error) {
            reportError(kind, error);
        }
    }

    return {
        setTimeout(callback: ScriptCallback, delay?: number, ...args: any[]) {
            if (typeof callback !== 'function') throw new TypeError('setTimeout requires a function');
            const handle = setTimeout(() => {
                timeouts.delete(handle);
                invoke('setTimeout', callback, args);
            }, delay);
            if (disposed) clearTimeout(handle); else timeouts.add(handle);
            return handle;
        },
        clearTimeout(handle: ReturnType<typeof setTimeout>) {
            timeouts.delete(handle);
            clearTimeout(handle);
        },
        setInterval(callback: ScriptCallback, delay?: number, ...args: any[]) {
            if (typeof callback !== 'function') throw new TypeError('setInterval requires a function');
            const handle = setInterval(function (this: ReturnType<typeof setInterval>) { invoke('setInterval', callback, args, this); }, delay);
            if (disposed) clearInterval(handle); else intervals.add(handle);
            return handle;
        },
        clearInterval(handle: ReturnType<typeof setInterval>) {
            intervals.delete(handle);
            clearInterval(handle);
        },
        setImmediate(callback: ScriptCallback, ...args: any[]) {
            if (typeof callback !== 'function') throw new TypeError('setImmediate requires a function');
            const handle = setImmediate(() => {
                immediates.delete(handle);
                invoke('setImmediate', callback, args);
            });
            if (disposed) clearImmediate(handle); else immediates.add(handle);
            return handle;
        },
        clearImmediate(handle: ReturnType<typeof setImmediate>) {
            immediates.delete(handle);
            clearImmediate(handle);
        },
        queueMicrotask(callback: ScriptCallback) {
            if (typeof callback !== 'function') throw new TypeError('queueMicrotask requires a function');
            queueMicrotask(() => invoke('queueMicrotask', callback, []));
        },
        dispose() {
            disposed = true;
            for (const handle of timeouts) clearTimeout(handle);
            for (const handle of intervals) clearInterval(handle);
            for (const handle of immediates) clearImmediate(handle);
            timeouts.clear();
            intervals.clear();
            immediates.clear();
        },
    };
}
