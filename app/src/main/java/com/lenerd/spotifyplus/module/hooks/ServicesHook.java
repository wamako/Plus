package com.lenerd.spotifyplus.module.hooks;
import com.lenerd.spotifyplus.module.*;
import de.robv.android.xposed.*;
/** Capture the named Retrofit factory without a version-specific constructor signature. */
public final class ServicesHook extends SpotifyHook {
    public static volatile Object retrofit;
    protected void hookSetup(){Class<?> type=findClass("com.spotify.connectivity.httpretrofit.RetrofitMaker");XposedBridge.hookAllConstructors(type,new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){retrofit=p.thisObject;}});}
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){return null;}
}
