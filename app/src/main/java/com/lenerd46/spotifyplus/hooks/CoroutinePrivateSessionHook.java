package com.lenerd46.spotifyplus.hooks;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import org.luckypray.dexkit.query.FindClass;
import org.luckypray.dexkit.query.FindMethod;
import org.luckypray.dexkit.query.matchers.ClassMatcher;
import org.luckypray.dexkit.query.matchers.MethodMatcher;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.util.Arrays;

/** The coroutine settings client used by Spotify 9.1.94 and later. */
final class CoroutinePrivateSessionHook extends SpotifyHook {
    private static final long REFRESH_DELAY = (5 * 60 + 45) * 60_000L;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = this::refresh;
    // Keep the listener alive: SharedPreferences stores it weakly.
    private SharedPreferences.OnSharedPreferenceChangeListener listener;
    private Object client;
    private Object enabledValue;
    private Object emptyContext;
    private Method setter;
    private long scheduledAt;

    CoroutinePrivateSessionHook(SharedPreferences prefs) { this.prefs = prefs; }

    @Override protected void hook() throws Exception {
        setter = bridge.findMethod(FindMethod.create().matcher(MethodMatcher.create()
                .usingStrings("spotify.settings.esperanto.proto.Settings", "SetPrivateSession")
                .paramCount(2).returnType(Object.class))).single().getMethodInstance(lpparm.classLoader);
        Class<?> valueType = setter.getParameterTypes()[0];
        Method boolFactory = Arrays.stream(valueType.getDeclaredMethods())
                .filter(m -> Modifier.isStatic(m.getModifiers()) && m.getReturnType() == valueType
                        && Arrays.equals(m.getParameterTypes(), new Class<?>[]{boolean.class}))
                .findFirst().orElseThrow();
        enabledValue = boolFactory.invoke(null, true);
        Class<?> contextType = bridge.findClass(FindClass.create().matcher(ClassMatcher.create()
                .usingStrings("EmptyCoroutineContext").fieldCount(1))).single().getInstance(lpparm.classLoader);
        for (Field field : contextType.getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers()) && field.getType() == contextType) {
                field.setAccessible(true);
                emptyContext = field.get(null);
            }
        }
        if (emptyContext == null) throw new IllegalStateException("Empty coroutine context unavailable");

        XposedBridge.hookAllConstructors(XposedHelpers.findClass(
                "com.spotify.esperanto.esperanto.CoroutineClientBase", lpparm.classLoader), new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (!setter.getDeclaringClass().isInstance(param.thisObject)) return;
                client = param.thisObject;
                schedule(750L);
            }
        });
        XposedBridge.hookMethod(setter, new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                client = param.thisObject;
                if (prefs.getBoolean("private_session", false)) param.args[0] = enabledValue;
            }
            @Override protected void afterHookedMethod(MethodHookParam param) {
                schedule(REFRESH_DELAY);
            }
        });
        // Observe the real core state; refresh if Spotify expires the session.
        Class<?> stateType = XposedHelpers.findClass(
                "com.spotify.settings.esperanto.proto.SettingsOuterClass$SettingsState", lpparm.classLoader);
        var getters = bridge.findMethod(FindMethod.create().matcher(MethodMatcher.create()
                .declaredClass(stateType).paramCount(0).returnType(boolean.class)
                .addUsingField(org.luckypray.dexkit.query.matchers.FieldMatcher.create()
                        .declaredClass(stateType).name("privateSession_").type(boolean.class))));
        for (var getter : getters) XposedBridge.hookMethod(getter.getMethodInstance(lpparm.classLoader), new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (Boolean.FALSE.equals(param.getResult())) schedule(750L);
            }
        });
        listener = (preferences, key) -> {
            if (!"private_session".equals(key)) return;
            schedule(0L);
        };
        prefs.registerOnSharedPreferenceChangeListener(listener);
        XposedBridge.log("[SpotifyPlus][PrivateSession] Coroutine settings client enabled");
    }

    private synchronized void schedule(long delay) {
        if (!prefs.getBoolean("private_session", false)) {
            handler.removeCallbacks(refresh);
            scheduledAt = 0L;
            return;
        }
        long next = SystemClock.uptimeMillis() + delay;
        // Frequent state reads must not continually postpone an imminent refresh.
        if (scheduledAt != 0L && scheduledAt <= next) return;
        handler.removeCallbacks(refresh);
        scheduledAt = next;
        handler.postAtTime(refresh, next);
    }

    private void refresh() {
        synchronized (this) { scheduledAt = 0L; }
        if (!prefs.getBoolean("private_session", false) || client == null) return;
        try {
            // Each call gets a fresh continuation. Never reuse Spotify's caller continuation.
            Object continuation = Proxy.newProxyInstance(lpparm.classLoader,
                    new Class<?>[]{setter.getParameterTypes()[1]}, (proxy, method, args) -> {
                        if (method.getName().equals("getContext")) return emptyContext;
                        if (method.getName().equals("resumeWith")) {
                            if (args[0] != null) for (Field field : args[0].getClass().getDeclaredFields()) {
                                if (Modifier.isStatic(field.getModifiers()) || !Throwable.class.isAssignableFrom(field.getType())) continue;
                                field.setAccessible(true);
                                XposedBridge.log((Throwable) field.get(args[0]));
                                schedule(60_000L);
                            }
                            return null;
                        }
                        return switch (method.getName()) {
                            case "equals" -> proxy == args[0];
                            case "hashCode" -> System.identityHashCode(proxy);
                            case "toString" -> "SpotifyPlus private-session continuation";
                            default -> throw new UnsupportedOperationException(method.toString());
                        };
                    });
            setter.invoke(client, enabledValue, continuation);
        } catch (Throwable error) {
            XposedBridge.log(error);
            schedule(60_000L);
        }
    }
}
