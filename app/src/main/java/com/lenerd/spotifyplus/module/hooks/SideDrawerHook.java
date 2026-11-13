package com.lenerd.spotifyplus.module.hooks;
import android.app.Activity;
import android.os.Build;
import android.view.ViewGroup;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
import com.lenerd46.spotifyplus.hooks.RemoveCreateButtonHook;
import org.json.JSONObject;
import java.util.concurrent.*;

/** API-2 registrations use the runtime-discovered drawer adapter proven on 9.1.94. */
public final class SideDrawerHook extends SpotifyHook {
    private static final class Entry{final String id,script,title;Entry(String id,String script,String title){this.id=id;this.script=script;this.title=title;}}
    private static final ConcurrentHashMap<String,Entry> entries=new ConcurrentHashMap<>();
    protected void hookSetup(){SpotifyNativeBridge.registerHandler("side",this);}
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){
        if(command.equals("register")){
            String id=(String)args[0],script=(String)args[1],title=(String)args[2],key=script+"/"+id;
            entries.put(key,new Entry(id,script,title));
            // Permanent launcher slots avoid relying on a cached Spotify drawer re-render.
        }else if(command.equals("unregisterScript")){
            String prefix=args[0]+"/";
            entries.keySet().removeIf(key->key.startsWith(prefix));
        }
        return null;
    }
    public static void openRegistered(String script){
        Entry entry=entries.values().stream().filter(e->e.script.equals(script)).findFirst().orElse(null);
        if(entry==null){if(com.lenerd46.spotifyplus.api2.Api2Runtime.isEnabled())com.lenerd46.spotifyplus.features.FeatureSheets.toast("Extensions are starting. Please wait a moment and try again.");else com.lenerd46.spotifyplus.api2.Api2Runtime.showFailure();return;}
        open(entry.script,entry.id);
    }
    public static void showExtensions(){
        Activity a=currentActivity;if(a==null)return;
        a.runOnUiThread(()->com.lenerd46.spotifyplus.features.FeatureSheets.show("Extensions",root->{
            java.util.List<Entry> active=entries.values().stream().filter(e->!e.script.equals("com.lenerd.marketplace")&&!e.script.equals("com.lenerd.settings")).sorted(java.util.Comparator.comparing(e->e.title)).toList();
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.text(a,active.isEmpty()?"Install extensions from Marketplace. Extensions with their own pages appear here.":"Installed extension pages",15));
            for(Entry e:active)root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.button(a,e.title,()->{com.lenerd46.spotifyplus.features.FeatureSheets.close();open(e.script,e.id);}));
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.button(a,"Marketplace",()->{com.lenerd46.spotifyplus.features.FeatureSheets.close();openRegistered("com.lenerd.marketplace");}));
            root.addView(com.lenerd46.spotifyplus.features.FeatureSheets.button(a,"Extension settings",()->{com.lenerd46.spotifyplus.features.FeatureSheets.close();openRegistered("com.lenerd.settings");}));
        }));
    }
    private static void open(String script,String id){
        Activity a=currentActivity;if(a==null)return;
        a.runOnUiThread(()->{try{
            SpotifyNativeBridge.attachSurfaceHost("sideDrawer",(ViewGroup)a.getWindow().getDecorView());
            SpotifyNativeBridge.sendJsonEvent("side.press",new JSONObject().put("id",id).put("scriptId",script));
        }catch(Throwable e){logError(e);}});
    }
}
