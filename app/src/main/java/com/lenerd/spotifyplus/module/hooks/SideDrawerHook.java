package com.lenerd.spotifyplus.module.hooks;
import android.app.Activity;
import android.os.Build;
import android.view.ViewGroup;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
import com.lenerd46.spotifyplus.hooks.RemoveCreateButtonHook;
import org.json.JSONObject;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** API-2 registrations use the runtime-discovered drawer adapter proven on 9.1.94. */
public final class SideDrawerHook extends SpotifyHook {
    private static final AtomicInteger ids=new AtomicInteger(-50000);
    private static final ConcurrentHashMap<String,Integer> registrations=new ConcurrentHashMap<>();
    private static android.window.OnBackInvokedDispatcher dispatcher;
    private static android.window.OnBackInvokedCallback back;
    protected void hookSetup(){SpotifyNativeBridge.registerHandler("side",this);}
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){
        if(command.equals("register")){
            String id=(String)args[0],script=(String)args[1],title=(String)args[2],key=script+"/"+id;
            int nativeId=registrations.computeIfAbsent(key,k->ids.getAndDecrement());
            String label=script.toLowerCase(java.util.Locale.ROOT).contains("settings")?"Extension settings":title;
            RemoveCreateButtonHook.registerSideButton(label,nativeId,()->open(script,id));
        }else if(command.equals("unregisterScript")){
            String prefix=args[0]+"/";
            registrations.entrySet().removeIf(e->{if(!e.getKey().startsWith(prefix))return false;RemoveCreateButtonHook.unregisterSideButton(e.getValue());return true;});
        }else if(command.equals("surfaceClosed"))clearBack();
        return null;
    }
    private static void clearBack(){if(Build.VERSION.SDK_INT>=33&&dispatcher!=null&&back!=null)dispatcher.unregisterOnBackInvokedCallback(back);dispatcher=null;back=null;}
    private static void open(String script,String id){
        Activity a=currentActivity;if(a==null)return;
        a.runOnUiThread(()->{try{
            clearBack();SpotifyNativeBridge.attachSurfaceHost("sideDrawer",(ViewGroup)a.getWindow().getDecorView());
            if(Build.VERSION.SDK_INT>=33){dispatcher=a.getOnBackInvokedDispatcher();back=()->{try{SpotifyNativeBridge.sendJsonEvent("android.backPressed",new JSONObject().put("scriptId",script).put("surfaceId","sideDrawer"));}catch(Exception e){logError(e);}};dispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_OVERLAY,back);}
            SpotifyNativeBridge.sendJsonEvent("side.press",new JSONObject().put("id",id).put("scriptId",script));
        }catch(Throwable e){logError(e);}});
    }
}
