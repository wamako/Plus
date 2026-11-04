package com.lenerd46.spotifyplus.compat;

import java.lang.reflect.Proxy;

/** Adapts a module action to Spotify's callback interface and caller-specific result. */
public final class SpotifyCallback {
    private SpotifyCallback() {}

    public static Object create(ClassLoader loader, Class<?> type, Object result, Runnable action) {
        if (!type.isInterface()) throw new IllegalArgumentException("Expected a callback interface");
        return Proxy.newProxyInstance(loader, new Class<?>[]{type}, (proxy, method, args) -> {
            if (method.getDeclaringClass() == Object.class) {
                return switch (method.getName()) {
                    case "equals" -> proxy == args[0];
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "toString" -> "SpotifyPlus callback";
                    default -> throw new UnsupportedOperationException(method.toString());
                };
            }
            if (!method.getName().equals("invoke")) throw new UnsupportedOperationException(method.toString());
            action.run();
            return result;
        });
    }
}
