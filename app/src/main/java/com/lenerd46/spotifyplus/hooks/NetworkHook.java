package com.lenerd46.spotifyplus.hooks;

import android.content.Context;
import android.content.SharedPreferences;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import org.luckypray.dexkit.query.FindMethod;
import org.luckypray.dexkit.query.FindClass;
import org.luckypray.dexkit.query.matchers.ClassMatcher;
import org.luckypray.dexkit.query.matchers.MethodMatcher;

import java.lang.reflect.Method;

public class NetworkHook extends SpotifyHook {
    private final Context context;

    public NetworkHook(Context context) {
        this.context = context;
    }

    @Override
    protected void hook() {
        SharedPreferences prefs = context.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);

        if (prefs.getBoolean("block_ads", false)) {
            try {

                var builders = bridge.findClass(FindClass.create().matcher(ClassMatcher.create()
                        .usingStrings("method.isEmpty() == true", " must not have a request body.",
                                " must have a request body.")));
                Method httpBuildMethod = bridge.findMethod(FindMethod.create().searchInClass(builders)
                        .matcher(MethodMatcher.create().paramTypes(String.class).usingStrings("ws:", "wss:")))
                        .single().getMethodInstance(lpparm.classLoader);

                XposedBridge.hookMethod(httpBuildMethod, new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                        String url = param.args[0].toString();

                        // || url.contains("gabo-receiver-service") || url.contains("net-fortune") ||
                        // url.contains("darwin-experiments") || url.contains("speechless-sharing") ||
                        // url.contains("pendragon")
                        if (url.contains("/ads") || url.contains("ad.") || url.contains("ad-logic")
                                || url.contains("videoamp") || url.contains("aet") || url.contains("secure-gl")) {
                            param.args[0] = "https://127.0.0.1:404/";
                            // XposedBridge.log("[SpotifyPlus] " + url);
                        } else {
                            // XposedBridge.log("[SpotifyPlus] " + url);
                        }
                    }
                });
            } catch (NoSuchMethodException ignored) {
            }
        }
    }
}
