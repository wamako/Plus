package com.lenerd.spotifyplus.module.scripting.nativestuff;

import com.lenerd.spotifyplus.sdk.hooks.HookCall;
import com.lenerd.spotifyplus.sdk.hooks.HookCallback;
import com.lenerd.spotifyplus.sdk.hooks.HookHandle;
import com.lenerd.spotifyplus.sdk.hooks.SpotifyPlusHooks;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.lang.reflect.Executable;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import org.luckypray.dexkit.DexKitBridge;

/** Classic Xposed API 82 implementation of {@link SpotifyPlusHooks}. */
public final class NativeHooks implements SpotifyPlusHooks {
    private static volatile ClassLoader loader;
    private static volatile DexKitBridge dexKit;

    public static void initialize(ClassLoader classLoader, DexKitBridge bridge) {
        loader = classLoader;
        dexKit = bridge;
    }

    private final Set<HookHandle> handles = new HashSet<>();
    private volatile boolean closed;

    private void checkOpen() {
        if (closed) throw new IllegalStateException("Extension has unloaded");
    }

    @Override
    public synchronized ClassLoader getClassLoader() {
        checkOpen();
        return Objects.requireNonNull(loader, "Hook host is not ready");
    }

    @Override
    public synchronized DexKitBridge getDexKit() {
        checkOpen();
        return Objects.requireNonNull(dexKit, "DexKit is unavailable");
    }

    @Override
    public synchronized HookHandle hook(Executable member, int priority, HookCallback callback) {
        checkOpen();
        Objects.requireNonNull(member, "Hook member is required");
        Objects.requireNonNull(callback, "Hook callback is required");
        XC_MethodHook.Unhook nativeHandle = XposedBridge.hookMethod(member, new XC_MethodHook(priority) {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                if (closed) return;
                try {
                    Object[] args = param.args == null ? new Object[0] : param.args;
                    Object result = HookCall.intercept(
                        member,
                        param.thisObject,
                        args,
                        nextArgs -> {
                            try {
                                return XposedBridge.invokeOriginalMethod(member, param.thisObject, nextArgs);
                            } catch (InvocationTargetException error) {
                                Throwable cause = error.getCause();
                                throw cause != null ? cause : error;
                            }
                        },
                        callback,
                        error -> android.util.Log.e("SpotifyPlus", "Native extension hook callback failed", error)
                    );
                    param.setResult(result);
                } catch (Throwable error) {
                    param.setThrowable(error);
                }
            }
        });
        HookHandle handle = new HookHandle() {
            private boolean removed;

            @Override
            public void unhook() {
                synchronized (NativeHooks.this) {
                    if (removed) return;
                    nativeHandle.unhook();
                    removed = true;
                    handles.remove(this);
                }
            }
        };
        handles.add(handle);
        return handle;
    }

    @Override
    public Object invokeOriginal(Method method, Object receiver, Object... args) throws Throwable {
        synchronized (this) {
            checkOpen();
        }
        try {
            return XposedBridge.invokeOriginalMethod(method, receiver, args);
        } catch (InvocationTargetException error) {
            Throwable cause = error.getCause();
            throw cause != null ? cause : error;
        }
    }

    @Override
    public synchronized void close() {
        closed = true;
        for (HookHandle handle : new ArrayList<>(handles)) {
            try {
                handle.unhook();
            } catch (Throwable error) {
                android.util.Log.e("SpotifyPlus", "Could not remove extension hook", error);
            }
        }
        handles.clear();
    }
}
