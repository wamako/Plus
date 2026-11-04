package com.lenerd.spotifyplus.module;
import android.app.Activity;
import android.os.*;
import android.util.Log;
import android.widget.Toast;
import de.robv.android.xposed.*;
import org.luckypray.dexkit.DexKitBridge;
import java.lang.reflect.*;
import java.util.concurrent.ConcurrentHashMap;

/** Compatibility host: API-2 Java helpers use the working legacy Xposed loader. */
public abstract class SpotifyHook {
    protected static DexKitBridge bridge;
    protected static ClassLoader classLoader;
    public static Activity currentActivity;
    private static final ConcurrentHashMap<Class<?>,SpotifyHook> instances=new ConcurrentHashMap<>();
    public final void init(ClassLoader loader,DexKitBridge dex){classLoader=loader;bridge=dex;instances.put(getClass(),this);try{hookSetup();}catch(Throwable e){logError(e);}}
    protected abstract void hookSetup() throws Exception;
    protected abstract void beforeHook(SpotifyCallback callback);
    protected abstract void afterHook(SpotifyCallback callback);
    public abstract Object handle(String command,Object[] args);
    protected final void hook(Member member){XposedBridge.hookMethod(member,new XC_MethodHook(){
        protected void beforeHookedMethod(MethodHookParam p){try{beforeHook(new SpotifyCallback(p));}catch(Throwable e){logError(e);}}
        protected void afterHookedMethod(MethodHookParam p){try{afterHook(new SpotifyCallback(p));}catch(Throwable e){logError(e);}}
    });}
    protected Class<?> findClass(String name){return XposedHelpers.findClass(name,classLoader);}
    protected static <T extends SpotifyHook>T getHook(Class<T> type){return type.cast(instances.get(type));}
    protected static SpotifyHook getHookInstance(Class<? extends SpotifyHook> type){return instances.get(type);}
    protected static void log(String s){Log.d("SpotifyPlus:API2",s);}
    protected static void logError(String s){Log.e("SpotifyPlus:API2",s);}
    protected static void logError(Throwable e){Log.e("SpotifyPlus:API2",e.getMessage(),e);}
    protected static void logError(String s,Exception e){Log.e("SpotifyPlus:API2",s,e);}
    protected static void toast(String s){Activity a=currentActivity;if(a!=null)new Handler(Looper.getMainLooper()).post(()->Toast.makeText(a,s,Toast.LENGTH_LONG).show());}
}
