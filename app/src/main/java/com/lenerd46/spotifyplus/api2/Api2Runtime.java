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
    private static final String LYRICS_SEED_REV = "83238365a1-w3";
    private static final String PLAYNEXT_SEED_REV = "1f46c66111";
    private static final String SUITE_SEED_REV = "wave3-0.3.1";
    private static volatile boolean enabled,started;
    private static final AtomicBoolean starting=new AtomicBoolean();
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static String token="";
    private static volatile String moduleIdentity="";
    private static volatile String stage="initializing", failure="";
    private Api2Runtime(){}
    public static boolean isEnabled(){return enabled;}
    public static void startFailed(Throwable error){
        started=false;enabled=false;
        Throwable cause=error;
        for(int i=0;i<8 && cause.getCause()!=null && cause.getCause()!=cause;i++)cause=cause.getCause();
        failure="Stage: "+stage+"\n"+cause.getClass().getSimpleName()+": "+String.valueOf(cause.getMessage());
        Log.e("SpotifyPlus:API2","Native extension host failed",error);
        com.lenerd46.spotifyplus.features.FeatureSheets.toast("Extensions could not start. The native Spotify Plus features remain available.");
    }
    public static void initialize(Context context,ClassLoader loader,DexKitBridge dex,String modulePath){
        if(Build.VERSION.SDK_INT<30||!java.util.Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"))return;
        try{
            stage="hook initialization";
            Utils.MODULE_APK_PATH=modulePath;Utils.bridge=dex;Utils.spotifyVersion=context.getPackageManager().getPackageInfo("com.spotify.music",0).versionName;
            Utils.platformData=new PlatformData(Utils.spotifyVersion,"android",Build.VERSION.RELEASE,Build.VERSION.SDK_INT);
            String sourceDir=context.getApplicationInfo().sourceDir;
            String dataDir=context.getApplicationInfo().dataDir;
            File moduleApk=new File(modulePath);
            String resolvedIdentity=com.lenerd46.spotifyplus.BuildConfig.VERSION_NAME+"-"+com.lenerd46.spotifyplus.BuildConfig.VERSION_CODE+":"+moduleApk.length()+":"+moduleApk.lastModified();
            moduleIdentity=resolvedIdentity;
            com.lenerd.spotifyplus.module.fingerprint.HookFingerprints.initialize(dex,loader,sourceDir,dataDir,resolvedIdentity);
            com.lenerd.spotifyplus.module.scripting.nativestuff.NativeHooks.initialize(loader,dex);
            // All extension preferences, write journals and file storage route
            // through this handler. Register it before the Node host can start.
            new StorageHook().init(loader,dex);
            new SystemHook().init(loader,dex);
            new ThemeHook().init(dataDir,loader,dex);
            new AndroidBackHook().init(loader,dex);
            new UiInspectorHook().init(loader,dex);
            new ServicesHook().init(loader,dex);new PlayerHook().init(loader,dex);
            new SongChangeHook().init(loader,dex);
            new SideDrawerHook().init(loader,dex);new ContextMenuHook().init(loader,dex);
            new SleepTimerHook().init(loader,dex);
            new ComposeHeaderTarget().init(loader,dex);
            new MenuUITargets().init(loader,dex);
            new NowPlayingUITarget().init(loader,dex);
            new PageUITargets().init(loader,dex);
            new RegionUITargets().init(loader,dex);
            new ComposeRegionTargets().init(loader,dex);
            new ReactManager().init(loader,dex);new LocalExtensionHook().init(loader,dex);
            com.lenerd.spotifyplus.module.diagnostics.HookHealth.startupComplete=true;
            enabled=true;
            XposedHelpers.findAndHookMethod(Activity.class,"onResume",new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){
                Activity activity=(Activity)p.thisObject;com.lenerd.spotifyplus.module.SpotifyHook.currentActivity=activity;
                if(enabled && starting.compareAndSet(false,true))new Thread(()->start(activity),"SpotifyPlus-API2-Start").start();
            }});
            XposedHelpers.findAndHookMethod(Activity.class,"onActivityResult",int.class,int.class,Intent.class,new XC_MethodHook(){protected void beforeHookedMethod(MethodHookParam p){
                if(p.args==null||p.args.length<3||!(p.args[0] instanceof Integer))return;
                int requestCode=(Integer)p.args[0];
                if(requestCode!=StorageBackupHelper.REQUEST_BACKUP_RESTORE_FILE)return;
                int resultCode=p.args[1] instanceof Integer?(Integer)p.args[1]:Activity.RESULT_CANCELED;
                Intent data=p.args[2] instanceof Intent?(Intent)p.args[2]:null;
                if(StorageBackupHelper.handleActivityResult((Activity)p.thisObject,requestCode,resultCode,data))p.setResult(null);
            }});
        }catch(Throwable e){startFailed(e);}
    }
    private static void start(Activity activity){
        try{
            stage="bundled extension assets";
            seedBundledExtensions(activity);
            Utils.token=References.accessToken;Utils.clientToken=References.clientToken;
            stage="native libraries";
            ScriptManager manager=new ScriptManager(activity);
            stage="extension host";
            manager.start();if(enabled){started=true;main.post(Api2Runtime::refresh);}
        }catch(Throwable e){starting.set(false);startFailed(e);}
    }
    public static void showFailure(){
        com.lenerd46.spotifyplus.features.FeatureSheets.show("Extension startup",root->{
            Activity a=References.currentActivity;
            String report="Spotify Plus "+com.lenerd46.spotifyplus.BuildConfig.VERSION_NAME+"\nSpotify "+Utils.spotifyVersion+"\nAndroid "+Build.VERSION.RELEASE+" (API "+Build.VERSION.SDK_INT+")\n"+(failure.isEmpty()?"The extension host has not initialized.":failure);
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.text(a,"Extensions did not start. Copy these details if restarting Spotify does not resolve it.",16));
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.text(a,report,14));
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.button(a,"Copy startup details",()->{
                android.content.ClipboardManager clipboard=(android.content.ClipboardManager)a.getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("Spotify Plus startup",report));
                com.lenerd46.spotifyplus.features.FeatureSheets.toast("Startup details copied");
            }));
        });
    }
    private static String bundledSeedRevision(String baseRev){
        String identity=moduleIdentity;
        return identity==null||identity.isEmpty()?baseRev:baseRev+"|"+identity;
    }
    private static void seedBundledExtensions(Context context)throws IOException{
        SharedPreferences prefs=context.getSharedPreferences("SpotifyPlusAPI2",Context.MODE_PRIVATE);
        File root=new File(context.getFilesDir(),"spotifyplus-installed-extensions");
        seedExtension(prefs,root,"lyrics_seeded_rev",bundledSeedRevision(LYRICS_SEED_REV),"lyrics_seeded",".bundled-lyrics","api2-extensions/beautiful-lyrics","com.lenerd.beautifullyrics","Beautiful Lyrics");
        seedExtension(prefs,root,"playnext_seeded_rev",bundledSeedRevision(PLAYNEXT_SEED_REV),"playnext_seeded",".bundled-playnext","api2-extensions/play-next","com.lenerd.playnext","Play Next");
        seedExtensionGroup(prefs,root,"suite_seeded_rev",bundledSeedRevision(SUITE_SEED_REV),"api2-extensions/local-suite");
    }
    private static void seedExtension(SharedPreferences prefs,File root,String revKey,String rev,String boolKey,String stagingName,String assetPath,String targetId,String displayName)throws IOException{
        File target=new File(root,targetId);
        if(rev.equals(prefs.getString(revKey,""))&&new File(target,"manifest.json").isFile())return;
        File staging=new File(root,stagingName);
        deleteRecursively(staging);
        copyAssets(Utils.getModuleAssetManager(),assetPath,staging);
        deleteRecursively(target);
        if(!staging.renameTo(target))throw new IOException("Cannot activate bundled "+displayName);
        SharedPreferences.Editor editor=prefs.edit().putString(revKey,rev);
        if(boolKey!=null)editor.putBoolean(boolKey,true);
        if(!editor.commit())throw new IOException("Cannot save activation state for "+displayName);
    }
    private static void seedExtensionGroup(SharedPreferences prefs,File root,String revKey,String rev,String assetGroupPath)throws IOException{
        android.content.res.AssetManager assets=Utils.getModuleAssetManager();
        if(assets==null)throw new IOException("Module assets are unavailable");
        String[] children=assets.list(assetGroupPath);
        if(children==null||children.length==0)return;
        boolean already=rev.equals(prefs.getString(revKey,""));
        if(already){
            boolean allPresent=true;
            for(String id:children){if(!new File(new File(root,id),"manifest.json").isFile()){allPresent=false;break;}}
            if(allPresent)return;
        }
        for(String id:children){
            seedExtensionDirect(assets,root,assetGroupPath+"/"+id,id);
        }
        if(!prefs.edit().putString(revKey,rev).commit())throw new IOException("Cannot save activation state for "+assetGroupPath);
    }
    private static void seedExtensionDirect(android.content.res.AssetManager assets,File root,String assetPath,String targetId)throws IOException{
        File target=new File(root,targetId);
        File staging=new File(root,".bundled-"+targetId);
        deleteRecursively(staging);
        copyAssets(assets,assetPath,staging);
        deleteRecursively(target);
        if(!staging.renameTo(target))throw new IOException("Cannot activate bundled "+targetId);
    }
    private static void deleteRecursively(File file)throws IOException{
        if(!file.exists())return;
        if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)deleteRecursively(child);}
        if(!file.delete())throw new IOException("Cannot remove "+file);
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
            Object repository=com.lenerd46.spotifyplus.player.NextUpQueue.currentRepository();if(repository!=null)PlayerHook.adoptFallbackCore(repository);
            String current=References.accessToken;
            if(current!=null&&!current.isEmpty()&&!current.equals(token)){token=current;Utils.token=current;SpotifyNativeBridge.sendJsonEvent("event.updateToken",new JSONObject().put("accessToken",current));}
            Object state=References.playerState.get();if(state!=null)SpotifyServices.onPlayerState(state);
        }catch(Throwable e){Log.e("SpotifyPlus:API2","Could not refresh extension player state",e);}
        main.postDelayed(Api2Runtime::refresh,500);
    }
    public static void onPlayerState(Object state){
        if(!enabled)return;
        Utils.playerState=state;
        if(started){try{SpotifyServices.onPlayerState(state);ThemeHook.onPlayerState(state);NowPlayingUITarget.refresh();}catch(Throwable e){Log.e("SpotifyPlus:API2","Could not publish player state",e);}}
    }
}
