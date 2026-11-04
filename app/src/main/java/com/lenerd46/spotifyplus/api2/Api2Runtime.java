package com.lenerd46.spotifyplus.api2;

import android.app.Activity;
import android.content.*;
import android.os.*;
import android.util.Log;
import com.lenerd46.spotifyplus.References;
import com.lenerd.spotifyplus.module.Utils;
import com.lenerd.spotifyplus.module.hooks.*;
import com.lenerd.spotifyplus.module.scripting.*;
import com.lenerd.spotifyplus.module.scripting.entities.PlatformData;
import de.robv.android.xposed.*;
import org.luckypray.dexkit.DexKitBridge;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Starts the actual API-2 host while retaining the working legacy hooks and preferences. */
public final class Api2Runtime {
    private static volatile boolean enabled,started;
    private static final AtomicBoolean starting=new AtomicBoolean();
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static String token="";
    private Api2Runtime(){}
    public static boolean isEnabled(){return enabled;}
    public static void startFailed(Throwable error){
        started=false;enabled=false;
        Log.e("SpotifyPlus:API2","Native extension host failed",error);
        com.lenerd46.spotifyplus.features.FeatureSheets.toast("Extensions could not start. The native Spotify Plus features remain available.");
    }
    public static void initialize(Context context,ClassLoader loader,DexKitBridge dex,String modulePath){
        if(Build.VERSION.SDK_INT<30||!java.util.Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"))return;
        try{
            Utils.MODULE_APK_PATH=modulePath;Utils.bridge=dex;Utils.spotifyVersion=context.getPackageManager().getPackageInfo("com.spotify.music",0).versionName;
            Utils.platformData=new PlatformData(Utils.spotifyVersion,"android",Build.VERSION.RELEASE,Build.VERSION.SDK_INT);
            new ServicesHook().init(loader,dex);new PlayerHook().init(loader,dex);
            new SideDrawerHook().init(loader,dex);new ContextMenuHook().init(loader,dex);
            new ReactManager().init(loader,dex);new LocalExtensionHook().init(loader,dex);new NowPlayingUITarget().init(loader,dex);
            enabled=true;
            XposedHelpers.findAndHookMethod(Activity.class,"onResume",new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){
                Activity activity=(Activity)p.thisObject;com.lenerd.spotifyplus.module.SpotifyHook.currentActivity=activity;
                if(starting.compareAndSet(false,true))new Thread(()->start(activity),"SpotifyPlus-API2-Start").start();
            }});
        }catch(Throwable e){enabled=false;Log.e("SpotifyPlus:API2","Could not initialize extension host",e);}
    }
    private static void start(Activity activity){
        try{
            seedLyrics(activity);
            Utils.token=References.accessToken;Utils.clientToken=References.clientToken;
            new ScriptManager(activity).start();started=true;main.post(Api2Runtime::refresh);
        }catch(Throwable e){starting.set(false);startFailed(e);}
    }
    private static void seedLyrics(Context context)throws IOException{
        SharedPreferences prefs=context.getSharedPreferences("SpotifyPlusAPI2",Context.MODE_PRIVATE);
        if(prefs.getBoolean("lyrics_seeded",false))return;
        File root=new File(context.getFilesDir(),"spotifyplus-installed-extensions");
        File target=new File(root,"com.lenerd.beautifullyrics");
        if(new File(target,"manifest.json").isFile()){prefs.edit().putBoolean("lyrics_seeded",true).apply();return;}
        File staging=new File(root,".bundled-lyrics");
        copyAssets(Utils.getModuleAssetManager(),"api2-extensions/beautiful-lyrics",staging);
        if(!target.exists()&&!staging.renameTo(target))throw new IOException("Cannot activate bundled Beautiful Lyrics");
        if(!prefs.edit().putBoolean("lyrics_seeded",true).commit())throw new IOException("Cannot save extension activation state");
    }
    private static void copyAssets(android.content.res.AssetManager assets,String path,File target)throws IOException{
        if(assets==null)throw new IOException("Module assets are unavailable");
        String[] children=assets.list(path);
        if(children!=null&&children.length>0){if(!target.isDirectory()&&!target.mkdirs())throw new IOException("Cannot create extension folder");for(String child:children)copyAssets(assets,path+"/"+child,new File(target,child));return;}
        File parent=target.getParentFile();if(parent!=null&&!parent.isDirectory()&&!parent.mkdirs())throw new IOException("Cannot create extension folder");
        try(InputStream in=assets.open(path);OutputStream out=new FileOutputStream(target)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}
    }
    private static void refresh(){
        if(!started)return;
        try{
            Utils.clientToken=References.clientToken;PlayerHook.username=References.spotifyUsername;
            Object repository=com.lenerd46.spotifyplus.player.NextUpQueue.currentRepository();if(repository!=null)PlayerHook.core=repository;
            String current=References.accessToken;
            if(current!=null&&!current.isEmpty()&&!current.equals(token)){token=current;Utils.token=current;SpotifyNativeBridge.sendJsonEvent("event.updateToken",new JSONObject().put("accessToken",current));}
            Object state=References.playerState.get();if(state!=null)SpotifyServices.onPlayerState(state);
        }catch(Throwable e){Log.e("SpotifyPlus:API2","Could not refresh extension player state",e);}
        main.postDelayed(Api2Runtime::refresh,500);
    }
    public static void onPlayerState(Object state){
        if(!enabled)return;
        Utils.playerState=state;
        if(started){try{SpotifyServices.onPlayerState(state);NowPlayingUITarget.refresh();}catch(Throwable e){Log.e("SpotifyPlus:API2","Could not publish player state",e);}}
    }
}
