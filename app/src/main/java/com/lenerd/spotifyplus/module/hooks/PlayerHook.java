package com.lenerd.spotifyplus.module.hooks;
import android.media.session.MediaController;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
import de.robv.android.xposed.*;
import java.lang.reflect.*;
import java.util.*;
import org.luckypray.dexkit.query.FindClass;
import org.luckypray.dexkit.query.matchers.ClassMatcher;
import org.luckypray.dexkit.query.matchers.MethodMatcher;
import com.lenerd46.spotifyplus.api2.NativePlaybackCommand;
/** Uses Spotify's own Android media session, avoiding obfuscated command classes. */
public final class PlayerHook extends SpotifyHook {
    public static volatile Object core,contextPlayer;
    public static volatile String username;
    public static volatile String playBinding="initializing";
    private static volatile MediaController controller;
    protected void hookSetup(){
        SpotifyNativeBridge.registerHandler("player",this);
        try{captureNativePlay();}catch(Throwable error){playBinding="unavailable-"+error.getClass().getSimpleName();logError("Native PlayCommand binding unavailable: "+error.getClass().getSimpleName());}
        XposedHelpers.findAndHookMethod(android.media.session.MediaSession.class,"setPlaybackState",android.media.session.PlaybackState.class,new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){controller=((android.media.session.MediaSession)p.thisObject).getController();}});
    }
    private void captureNativePlay() throws Exception {
        Class<?> command=findClass("com.spotify.player.model.command.PlayCommand"),single=findClass("io.reactivex.rxjava3.core.Single"),client=findClass("com.spotify.esperanto.esperanto.ClientBase");
        List<Class<?>> matches=new ArrayList<>();
        for(var candidate:bridge.findClass(FindClass.create().matcher(ClassMatcher.create().addMethod(MethodMatcher.create().paramTypes(command).returnType(single))))) {
            Class<?> owner=candidate.getInstance(classLoader);
            if(Modifier.isAbstract(owner.getModifiers()) || owner.isInterface()) continue;
            boolean hasClient=false;
            for(Field f:owner.getDeclaredFields()) if(!Modifier.isStatic(f.getModifiers()) && client.isAssignableFrom(f.getType())) hasClient=true;
            if(hasClient){NativePlaybackCommand.dispatcher(classLoader,owner);matches.add(owner);}
        }
        if(matches.size()!=1) throw new IllegalStateException("Expected one native PlayCommand owner, found "+matches.size());
        Class<?> owner=matches.get(0);
        XposedBridge.hookAllConstructors(owner,new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){if(!p.hasThrowable())contextPlayer=p.thisObject;}});
        XposedBridge.hookMethod(NativePlaybackCommand.dispatcher(classLoader,owner),new XC_MethodHook(){protected void beforeHookedMethod(MethodHookParam p){contextPlayer=p.thisObject;}});
        playBinding="installed";
        log("Native PlayCommand binding installed");
    }
    public static Object dispatchCommand(String command,Object... args){
        MediaController c=controller;if(c==null)throw new IllegalStateException("Start playback before using player controls");
        MediaController.TransportControls controls=c.getTransportControls();
        switch(command){case "play":controls.play();break;case "pause":controls.pause();break;case "togglePlay":if(c.getPlaybackState()!=null&&c.getPlaybackState().getState()==android.media.session.PlaybackState.STATE_PLAYING)controls.pause();else controls.play();break;case "seek":controls.seekTo(((Number)args[0]).longValue());break;case "skipNext":controls.skipToNext();break;case "skipPrevious":controls.skipToPrevious();break;default:throw new IllegalArgumentException("Unsupported player command: "+command);}
        return XposedHelpers.callStaticMethod(XposedHelpers.findClass("io.reactivex.rxjava3/core/Single".replace('/','.'),classLoader),"just",Boolean.TRUE);
    }
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){return dispatchCommand(command,args);}
}
