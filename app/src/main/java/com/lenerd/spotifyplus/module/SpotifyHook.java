package com.lenerd.spotifyplus.module;
import android.app.Activity;
import android.os.*;
import android.util.Log;
import android.widget.Toast;
import com.lenerd.spotifyplus.module.diagnostics.HookHealth;
import com.lenerd.spotifyplus.module.fingerprint.FingerprintMapping;
import com.lenerd.spotifyplus.module.fingerprint.HookFingerprints;
import de.robv.android.xposed.*;
import org.luckypray.dexkit.DexKitBridge;
import java.lang.reflect.*;
import java.util.concurrent.ConcurrentHashMap;

/** Compatibility host: API-2 Java helpers use the working legacy Xposed loader. */
public abstract class SpotifyHook {
    protected static DexKitBridge bridge;
    protected static ClassLoader classLoader;
    public static volatile Activity currentActivity;
    private static final ConcurrentHashMap<Class<?>, SpotifyHook> instances = new ConcurrentHashMap<>();
    protected final HookHealth.State health = HookHealth.register(getClass().getSimpleName());

    public final void init(ClassLoader loader, DexKitBridge dex) {
        classLoader = loader;
        bridge = dex;
        instances.put(getClass(), this);
        HookHealth.State previous = HookHealth.enter(health);
        boolean failed = false;
        try {
            hookSetup();
        } catch (Throwable e) {
            failed = true;
            logError(e);
        } finally {
            health.finished(failed);
            HookHealth.restore(previous);
        }
    }

    protected abstract void hookSetup() throws Exception;
    protected abstract void beforeHook(SpotifyCallback callback);
    protected abstract void afterHook(SpotifyCallback callback);
    public abstract Object handle(String command, Object[] args);

    public final Object handleObserved(String command, Object[] args) {
        HookHealth.State previous = HookHealth.enter(health);
        try {
            return handle(command, args);
        } catch (RuntimeException | Error error) {
            HookHealth.error(error.toString());
            throw error;
        } finally {
            HookHealth.restore(previous);
        }
    }

    protected <T> T resolve(FingerprintMapping<T> mapping) {
        return HookFingerprints.get().resolve(mapping);
    }

    protected final XC_MethodHook.Unhook registerHook(Member member) {
        XC_MethodHook.Unhook unhook = XposedBridge.hookMethod(member, new XC_MethodHook() {
            protected void beforeHookedMethod(MethodHookParam p) {
                health.invoked(p.method);
                HookHealth.State previous = HookHealth.enter(health);
                try {
                    beforeHook(new SpotifyCallback(p));
                } catch (Throwable e) {
                    logError(e);
                } finally {
                    HookHealth.restore(previous);
                }
            }

            protected void afterHookedMethod(MethodHookParam p) {
                HookHealth.State previous = HookHealth.enter(health);
                try {
                    afterHook(new SpotifyCallback(p));
                } catch (Throwable e) {
                    logError(e);
                } finally {
                    HookHealth.restore(previous);
                }
            }
        });
        health.installed(member);
        return unhook;
    }

    protected final void hook(Member member) { registerHook(member); }

    protected Class<?> findClass(String name) { return XposedHelpers.findClass(name, classLoader); }
    protected static <T extends SpotifyHook> T getHook(Class<T> type) { return type.cast(instances.get(type)); }
    protected static SpotifyHook getHookInstance(Class<? extends SpotifyHook> type) { return instances.get(type); }
    protected static void log(String s) { Log.d("SpotifyPlus:API2", s); }
    protected static void logError(String s) { HookHealth.error(s); Log.e("SpotifyPlus:API2", s); }
    protected static void logError(Throwable e) { HookHealth.error(String.valueOf(e)); Log.e("SpotifyPlus:API2", e.getMessage(), e); }
    protected static void logError(String s, Exception e) { HookHealth.error(s + ": " + e); Log.e("SpotifyPlus:API2", s, e); }
    protected static void toast(String s) { Activity a = currentActivity; if (a != null) new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(a, s, Toast.LENGTH_LONG).show()); }
}
