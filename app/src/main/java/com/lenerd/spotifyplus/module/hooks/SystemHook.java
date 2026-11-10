package com.lenerd.spotifyplus.module.hooks;

import android.app.Activity;
import android.content.Intent;
import android.os.*;
import android.widget.Toast;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
import com.lenerd46.spotifyplus.api2.NavigationIntents;

/** The hybrid host must register the system/UI handlers before starting Node. */
public final class SystemHook extends SpotifyHook {
    protected void hookSetup(){SpotifyNativeBridge.registerHandler("system",this);SpotifyNativeBridge.registerHandler("ui",this);log("System navigation handlers installed");}
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){
        Activity activity=currentActivity;
        if(activity==null||activity.isFinishing()||activity.isDestroyed())return false;
        if(command.equals("toast")) {
            new Handler(Looper.getMainLooper()).post(()->Toast.makeText(activity,(String)args[0],Boolean.TRUE.equals(args[1])?Toast.LENGTH_LONG:Toast.LENGTH_SHORT).show());return true;
        }
        if(command.equals("navigateBack")) {
            activity.runOnUiThread(activity::onBackPressed);return true;
        }
        if(!command.equals("navigate"))return false;
        try {
            Intent intent=NavigationIntents.create(activity,(String)args[0],(String)args[1]);
            if(intent==null){toast("Spotify could not open this link");return false;}
            activity.runOnUiThread(()->{try{activity.startActivity(intent);}catch(RuntimeException error){toast("Spotify could not open this link");logError("Navigation launch failed: "+error.getClass().getSimpleName());}});
            return true;
        } catch(RuntimeException error){toast("Spotify could not open this link");logError("Navigation request failed: "+error.getClass().getSimpleName());return false;}
    }
}
