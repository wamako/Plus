#!/usr/bin/env python3
"""Apply Wave 2 storage sharing, backup/restore, duplicate-script guard, and Settings UI updates."""
from pathlib import Path
import shutil
from apply_upstream_updates import change

HERE = Path(__file__).resolve().parent


def apply(source: Path) -> None:
    storage_hook = source / 'app/src/main/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java'
    change(
        storage_hook,
        '    private void handleSet(String scriptId, String key, Object value) {\n'
        '        try {\n'
        '            if(currentActivity == null) return;\n'
        '\n'
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(scriptId, Context.MODE_PRIVATE);\n'
        '            SharedPreferences.Editor editor = prefs.edit();\n'
        '\n'
        '            if(value == null || value == JSONObject.NULL) editor.remove(key).apply();\n'
        '            else editor.putString(key, String.valueOf(value)).apply();',
        '    private static String resolvePrefsName(String scriptId, String key) {\n'
        '        return scriptId != null && scriptId.startsWith("com.wamako.") && key != null && key.startsWith("@suite/")\n'
        '                ? "com.wamako.suite" : scriptId;\n'
        '    }\n\n'
        '    private void handleSet(String scriptId, String key, Object value) {\n'
        '        try {\n'
        '            if(currentActivity == null) return;\n'
        '            if("com.lenerd.settings".equals(scriptId) && key != null && key.startsWith("@backup/")) {\n'
        '                try {\n'
        '                    Class.forName("com.lenerd46.spotifyplus.api2.StorageBackupHelper")\n'
        '                            .getMethod("handleBackupSet", android.app.Activity.class, String.class, Object.class)\n'
        '                            .invoke(null, currentActivity, key, value);\n'
        '                } catch(ClassNotFoundException ignored) {}\n'
        '                return;\n'
        '            }\n'
        '\n'
        '            String resolvedPrefs = resolvePrefsName(scriptId, key);\n'
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(resolvedPrefs, Context.MODE_PRIVATE);\n'
        '            SharedPreferences.Editor editor = prefs.edit();\n'
        '\n'
        '            if(value == null || value == JSONObject.NULL) editor.remove(key).apply();\n'
        '            else editor.putString(key, String.valueOf(value)).apply();',
    )
    change(
        storage_hook,
        '    private String handleGet(String scriptId, String key) {\n'
        '        try {\n'
        '            if(currentActivity == null) return null;\n'
        '\n'
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(scriptId, Context.MODE_PRIVATE);\n'
        '            Object value = prefs.getAll().get(key);\n'
        '            return value == null ? null : String.valueOf(value);',
        '    private String handleGet(String scriptId, String key) {\n'
        '        try {\n'
        '            if(currentActivity == null) return null;\n'
        '            if("com.lenerd.settings".equals(scriptId) && key != null && key.startsWith("@backup/")) {\n'
        '                try {\n'
        '                    Object res = Class.forName("com.lenerd46.spotifyplus.api2.StorageBackupHelper")\n'
        '                            .getMethod("handleBackupGet", Context.class, String.class)\n'
        '                            .invoke(null, currentActivity, key);\n'
        '                    return res == null ? null : String.valueOf(res);\n'
        '                } catch(ClassNotFoundException ignored) { return null; }\n'
        '            }\n'
        '\n'
        '            String resolvedPrefs = resolvePrefsName(scriptId, key);\n'
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(resolvedPrefs, Context.MODE_PRIVATE);\n'
        '            Object value = prefs.getAll().get(key);\n'
        '            return value == null ? null : String.valueOf(value);',
    )
    change(
        storage_hook,
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(scriptId, Context.MODE_PRIVATE);\n'
        '            prefs.edit().remove(key).apply();',
        '            String resolvedPrefs = resolvePrefsName(scriptId, key);\n'
        '            SharedPreferences prefs = currentActivity.getSharedPreferences(resolvedPrefs, Context.MODE_PRIVATE);\n'
        '            prefs.edit().remove(key).apply();',
    )

    loader_ts = source / 'app/src/main/assets/nodejs-src/loader/script-loader.ts'
    change(
        loader_ts,
        '        for (const entry of entries) {\n'
        '            if (!entry.isDirectory()) continue;\n'
        '            const scriptDirectory = path.join(root, entry.name);\n'
        '            try {\n'
        '                this.loadScript(scriptDirectory, trust);\n'
        '            } catch (error) {\n'
        '                this.logger.error(`Failed to load script at ${scriptDirectory}`, error);\n'
        '            }\n'
        '        }',
        '        for (const entry of entries) {\n'
        '            if (!entry.isDirectory()) continue;\n'
        '            const scriptDirectory = path.join(root, entry.name);\n'
        '            try {\n'
        '                if (fs.existsSync(path.join(scriptDirectory, "manifest.json"))) {\n'
        '                    const manifest = this.readManifest(scriptDirectory);\n'
        '                    if (this.scriptDirectories.has(manifest.id)) {\n'
        '                        const existing = this.runtime.registry.getScript(manifest.id);\n'
        '                        if (existing && this.compareScriptVersions(manifest.version, existing.manifest.version) > 0) {\n'
        '                            this.logger.info(`Replacing older duplicate script ${manifest.id} (${existing.manifest.version}) with ${manifest.version} at ${scriptDirectory}`);\n'
        '                            this.runtime.unregisterScript(manifest.id);\n'
        '                            this.scriptDirectories.delete(manifest.id);\n'
        '                            this.scriptTrust.delete(manifest.id);\n'
        '                        } else {\n'
        '                            this.logger.info(`Skipping duplicate script ${manifest.id} at ${scriptDirectory}`);\n'
        '                            continue;\n'
        '                        }\n'
        '                    }\n'
        '                }\n'
        '                this.loadScript(scriptDirectory, trust);\n'
        '            } catch (error) {\n'
        '                this.logger.error(`Failed to load script at ${scriptDirectory}`, error);\n'
        '            }\n'
        '        }',
    )
    change(
        loader_ts,
        '    unloadFromRoot(root: string): void {',
        '    private compareScriptVersions(a: string | undefined, b: string | undefined): number {\n'
        "        const partsA = String(a ?? '0').split(/[.-]/).map(part => parseInt(part, 10) || 0);\n"
        "        const partsB = String(b ?? '0').split(/[.-]/).map(part => parseInt(part, 10) || 0);\n"
        '        const length = Math.max(partsA.length, partsB.length);\n'
        '        for (let i = 0; i < length; i++) {\n'
        '            const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);\n'
        '            if (diff !== 0) return diff > 0 ? 1 : -1;\n'
        '        }\n'
        '        return 0;\n'
        '    }\n\n'
        '    unloadFromRoot(root: string): void {',
    )

    settings_src = source / 'scripts/settings/src'
    shutil.copy2(HERE / 'backports/wave2/backup-page.tsx', settings_src / 'backup-page.tsx')
    app_tsx = settings_src / 'app.tsx'
    change(
        app_tsx,
        "import { ThemePage } from './theme-page';",
        "import { ThemePage } from './theme-page';\nimport { BackupPage } from './backup-page';",
    )
    change(
        app_tsx,
        "type Page = 'home' | 'extensions' | 'developer' | 'about' | 'ui-order' | 'theme';",
        "type Page = 'home' | 'extensions' | 'developer' | 'about' | 'ui-order' | 'theme' | 'backup';",
    )
    change(
        app_tsx,
        "        if (page === 'theme') return 'Theme';",
        "        if (page === 'theme') return 'Theme';\n        if (page === 'backup') return 'Backup & Restore';",
    )
    change(
        app_tsx,
        "                        <SettingsCategory icon={ICONS.developer} title='Developer' subtitle='Developer mode • Local extensions' onPress={() => setPage('developer')} />",
        "                        <SettingsCategory icon={ICONS.developer} title='Developer' subtitle='Developer mode • Local extensions' onPress={() => setPage('developer')} />\n"
        "                        <SettingsCategory icon={ICONS.extensions} title='Backup & Restore' subtitle='Export settings, ratings, bookmarks & theme' onPress={() => setPage('backup')} />",
    )
    change(
        app_tsx,
        "                {page === 'theme' && <ThemePage />}",
        "                {page === 'theme' && <ThemePage />}\n                {page === 'backup' && <BackupPage />}",
    )

    services_java = source / 'app/src/main/java/com/lenerd/spotifyplus/module/scripting/SpotifyServices.java'
    if services_java.exists():
        services_text = services_java.read_text(encoding='utf-8')
        old_client = '    /** The ContextPlayer esperanto client held by Spotify\'s player command dispatcher. */\n    static Object client(Object core) throws Exception { return resolve(PlayerSymbols.DISPATCHER_CLIENT).get(core); }'
        new_client = (
            '    /** The ContextPlayer esperanto client held by Spotify\'s player command dispatcher (or queue repository fallback). */\n'
            '    static Object client(Object core) throws Exception {\n'
            '        java.lang.reflect.Field field = resolve(PlayerSymbols.DISPATCHER_CLIENT);\n'
            '        if (field.getDeclaringClass().isInstance(core)) return field.get(core);\n'
            '        Object found = findClientField(core, resolve(PlayerSymbols.CLIENT));\n'
            '        if (found != null) return found;\n'
            '        try {\n'
            '            Class<?> clientBase = Class.forName("com.spotify.esperanto.esperanto.ClientBase", false, core.getClass().getClassLoader());\n'
            '            found = findClientField(core, clientBase);\n'
            '            if (found != null) return found;\n'
            '        } catch (ClassNotFoundException ignored) {}\n'
            '        return field.get(core);\n'
            '    }\n\n'
            '    private static Object findClientField(Object owner, Class<?> expectedType) {\n'
            '        if (owner == null || expectedType == null) return null;\n'
            '        if (expectedType.isInstance(owner)) return owner;\n'
            '        for (Class<?> type = owner.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {\n'
            '            for (java.lang.reflect.Field f : type.getDeclaredFields()) {\n'
            '                if (java.lang.reflect.Modifier.isStatic(f.getModifiers()) || f.getType().isPrimitive()) continue;\n'
            '                try {\n'
            '                    f.setAccessible(true);\n'
            '                    Object value = f.get(owner);\n'
            '                    if (value != null && expectedType.isInstance(value)) return value;\n'
            '                } catch (ReflectiveOperationException | RuntimeException ignored) {}\n'
            '            }\n'
            '        }\n'
            '        return null;\n'
            '    }'
        )
        if 'findClientField(' not in services_text:
            if old_client not in services_text:
                raise RuntimeError('SpotifyServices.client anchor changed')
            services_java.write_text(services_text.replace(old_client, new_client, 1), encoding='utf-8')

    sleep_java = source / 'app/src/main/java/com/lenerd/spotifyplus/module/hooks/SleepTimerHook.java'
    if sleep_java.exists() and 'trackNativeDuration(' not in sleep_java.read_text(encoding='utf-8'):
        change(
            sleep_java,
            '    private final WeakRows rows = new WeakRows();\n    private final ThreadLocal<Stack<SleepTimerOptions.Entry>> labels = ThreadLocal.withInitial(Stack::new);',
            '    private record LabelTarget(String title, int minutes) {}\n'
            '    private static final WeakIdentityMap<Integer> NATIVE_OPTIONS = new WeakIdentityMap<>();\n'
            '    private static final WeakIdentityMap<Integer> NATIVE_STATES = new WeakIdentityMap<>();\n'
            '    private final WeakIdentityMap<SleepTimerOptions.Entry> rows = new WeakIdentityMap<>();\n'
            '    private final ThreadLocal<Stack<LabelTarget>> labels = ThreadLocal.withInitial(Stack::new);\n\n'
            '    public static void trackNativeDuration(Object option, long minutes) {\n'
            '        if (option == null || minutes <= 0 || minutes > Integer.MAX_VALUE) return;\n'
            '        NATIVE_OPTIONS.put(option, (int) minutes);\n'
            '    }',
        )
        change(
            sleep_java,
            '    /** A tracked row reachable from {@code holder} through its instance fields, searching {@code depth} levels. */\n'
            '    private SleepTimerOptions.Entry tracked(Object holder, int depth) {\n'
            '        if (holder == null || rows.isEmpty()) return null;\n'
            '        SleepTimerOptions.Entry entry = rows.get(holder);\n'
            '        if (entry != null || depth == 0) return entry;\n'
            '        for (Class<?> type = holder.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {\n'
            '            for (Field field : type.getDeclaredFields()) {\n'
            '                if (Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive()) continue;\n'
            '                try {\n'
            '                    field.setAccessible(true);\n'
            '                    entry = tracked(field.get(holder), depth - 1);\n'
            '                } catch (ReflectiveOperationException | RuntimeException ignored) {}\n'
            '                if (entry != null) return entry;\n'
            '            }\n'
            '        }\n'
            '        return null;\n'
            '    }',
            '    /** A tracked row reachable from {@code holder} through its instance fields, searching {@code depth} levels. */\n'
            '    private SleepTimerOptions.Entry tracked(Object holder, int depth) {\n'
            '        return tracked(rows, holder, depth);\n'
            '    }\n\n'
            '    private static <V> V tracked(WeakIdentityMap<V> map, Object holder, int depth) {\n'
            '        if (holder == null || map.isEmpty()) return null;\n'
            '        V value = map.get(holder);\n'
            '        if (value != null || depth == 0) return value;\n'
            '        for (Class<?> type = holder.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {\n'
            '            for (Field field : type.getDeclaredFields()) {\n'
            '                if (Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive()) continue;\n'
            '                try {\n'
            '                    field.setAccessible(true);\n'
            '                    value = tracked(map, field.get(holder), depth - 1);\n'
            '                } catch (ReflectiveOperationException | RuntimeException ignored) {}\n'
            '                if (value != null) return value;\n'
            '            }\n'
            '        }\n'
            '        return null;\n'
            '    }',
        )
        change(
            sleep_java,
            '                        if (entry.owner() != null) rows.put(option, entry);',
            '                        if (entry.owner() != null) rows.put(option, entry);\n'
            '                        else NATIVE_OPTIONS.put(option, entry.minutes());',
        )
        change(
            sleep_java,
            '            } else if (callback.getMember().equals(renderLabel)) {\n'
            '                labels.get().push(tracked(self, 1));\n'
            '            } else if (callback.getMember().equals(quantityString)) {\n'
            '                Stack<SleepTimerOptions.Entry> stack = labels.get();\n'
            '                SleepTimerOptions.Entry entry = stack.empty() ? null : stack.peek();\n'
            '                if (entry != null) {\n'
            '                    String title = entry.title();\n'
            '                    if (title == null && entry.minutes() >= 60 && entry.minutes() % 60 != 0 && currentActivity != null) {\n'
            '                        int resource = currentActivity.getResources().getIdentifier("context_menu_sleep_timer_mins", "plurals", "com.spotify.music");\n'
            '                        title = currentActivity.getResources().getQuantityString(resource, entry.minutes(), entry.minutes());\n'
            '                    }\n'
            '                    if (title != null) callback.returnAndSkip(title);\n'
            '                }',
            '            } else if (callback.getMember().equals(renderLabel)) {\n'
            '                SleepTimerOptions.Entry entry = tracked(self, 1);\n'
            '                LabelTarget target = entry != null ? new LabelTarget(entry.title(), entry.minutes()) : null;\n'
            '                if (target == null) {\n'
            '                    Integer nativeMinutes = tracked(NATIVE_STATES, self, 1);\n'
            '                    if (nativeMinutes == null) nativeMinutes = tracked(NATIVE_OPTIONS, self, 2);\n'
            '                    if (nativeMinutes != null) target = new LabelTarget(null, nativeMinutes);\n'
            '                }\n'
            '                labels.get().push(target);\n'
            '            } else if (callback.getMember().equals(quantityString)) {\n'
            '                Stack<LabelTarget> stack = labels.get();\n'
            '                LabelTarget entry = stack.empty() ? null : stack.peek();\n'
            '                if (entry != null) {\n'
            '                    String title = entry.title();\n'
            '                    if (title == null && entry.minutes() >= 60 && entry.minutes() % 60 != 0) {\n'
            '                        android.content.res.Resources res = self instanceof android.content.res.Resources\n'
            '                            ? (android.content.res.Resources) self\n'
            '                            : (currentActivity != null ? currentActivity.getResources() : null);\n'
            '                        if (res != null) {\n'
            '                            int resource = res.getIdentifier("context_menu_sleep_timer_mins", "plurals", "com.spotify.music");\n'
            '                            if (resource != 0) title = res.getQuantityString(resource, entry.minutes(), entry.minutes());\n'
            '                        }\n'
            '                        if (title == null) title = entry.minutes() + " minutes";\n'
            '                    }\n'
            '                    if (title != null) callback.returnAndSkip(title);\n'
            '                }',
        )
        change(
            sleep_java,
            '            } else if (callback.getMember().equals(renderLabel)) {\n'
            '                Stack<SleepTimerOptions.Entry> stack = labels.get();\n'
            '                if (!stack.empty()) stack.pop();\n'
            '                if (stack.empty()) labels.remove();\n'
            '            } else if (callback.getThrowable() == null && (callback.getMember().equals(createState) || callback.getMember().equals(updateState))) {\n'
            '                // Both receive the duration row\'s props first; only rows created by extensions are tracked.\n'
            '                SleepTimerOptions.Entry entry = tracked(callback.getArgs()[0], 1);\n'
            '                if (entry != null) {\n'
            '                    Object result = callback.getResult();\n'
            '                    observeState(result);\n'
            '                    Object state = entry.kind().equals("button") ? buttonState(durationStateConstructor) : result;\n'
            '                    rows.put(state, entry);\n'
            '                    callback.setResult(state);\n'
            '                }',
            '            } else if (callback.getMember().equals(renderLabel)) {\n'
            '                Stack<LabelTarget> stack = labels.get();\n'
            '                if (!stack.empty()) stack.pop();\n'
            '                if (stack.empty()) labels.remove();\n'
            '            } else if (callback.getThrowable() == null && (callback.getMember().equals(createState) || callback.getMember().equals(updateState))) {\n'
            '                // Both receive the duration row\'s props first; only rows created by extensions are tracked in rows.\n'
            '                Object props = callback.getArgs()[0];\n'
            '                Object result = callback.getResult();\n'
            '                SleepTimerOptions.Entry entry = tracked(props, 1);\n'
            '                if (entry != null) {\n'
            '                    observeState(result);\n'
            '                    Object state = entry.kind().equals("button") ? buttonState(durationStateConstructor) : result;\n'
            '                    rows.put(state, entry);\n'
            '                    callback.setResult(state);\n'
            '                } else if (result != null) {\n'
            '                    Integer nativeMinutes = tracked(NATIVE_OPTIONS, props, 1);\n'
            '                    if (nativeMinutes != null) NATIVE_STATES.put(result, nativeMinutes);\n'
            '                }',
        )
        change(
            sleep_java,
            '    private static final class WeakRows {\n'
            '        private record Row(WeakReference<Object> object, SleepTimerOptions.Entry entry) {}\n\n'
            '        private final List<Row> values = new ArrayList<>();\n\n'
            '        synchronized void put(Object object, SleepTimerOptions.Entry entry) {\n'
            '            values.removeIf(row -> row.object.get() == null || row.object.get() == object);\n'
            '            values.add(new Row(new WeakReference<>(object), entry));\n'
            '        }\n\n'
            '        synchronized boolean isEmpty() {\n'
            '            values.removeIf(row -> row.object.get() == null);\n'
            '            return values.isEmpty();\n'
            '        }\n\n'
            '        synchronized SleepTimerOptions.Entry get(Object object) {\n'
            '            if (object == null) return null;\n'
            '            values.removeIf(row -> row.object.get() == null);\n'
            '            for (Row row : values) if (row.object.get() == object) return row.entry;\n'
            '            return null;\n'
            '        }\n'
            '    }',
            '    private static final class WeakIdentityMap<V> {\n'
            '        private record Row<V>(WeakReference<Object> object, V value) {}\n\n'
            '        private final List<Row<V>> values = new ArrayList<>();\n\n'
            '        synchronized void put(Object object, V value) {\n'
            '            values.removeIf(row -> row.object.get() == null || row.object.get() == object);\n'
            '            values.add(new Row<>(new WeakReference<>(object), value));\n'
            '        }\n\n'
            '        synchronized boolean isEmpty() {\n'
            '            values.removeIf(row -> row.object.get() == null);\n'
            '            return values.isEmpty();\n'
            '        }\n\n'
            '        synchronized V get(Object object) {\n'
            '            if (object == null) return null;\n'
            '            values.removeIf(row -> row.object.get() == null);\n'
            '            for (Row<V> row : values) if (row.object.get() == object) return row.value;\n'
            '            return null;\n'
            '        }\n'
            '    }',
        )
