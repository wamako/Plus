package com.lenerd.spotifyplus.module.hooks;
import android.media.session.MediaController;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
import de.robv.android.xposed.*;
/** Uses Spotify's own Android media session, avoiding obfuscated command classes. */
public final class PlayerHook extends SpotifyHook {
    public static volatile Object core,contextPlayer;
    public static volatile String username;
    private static volatile MediaController controller;
    protected void hookSetup(){
        SpotifyNativeBridge.registerHandler("player",this);
        XposedHelpers.findAndHookMethod(android.media.session.MediaSession.class,"setPlaybackState",android.media.session.PlaybackState.class,new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){controller=((android.media.session.MediaSession)p.thisObject).getController();}});
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
