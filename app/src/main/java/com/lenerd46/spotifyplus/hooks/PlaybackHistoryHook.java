package com.lenerd46.spotifyplus.hooks;
import android.content.Context;
import com.lenerd46.spotifyplus.features.RecentlyPlayed;
import com.lenerd46.spotifyplus.api2.Api2Runtime;
import de.robv.android.xposed.*;
public final class PlaybackHistoryHook extends SpotifyHook {
    private final Context context;public PlaybackHistoryHook(Context context){this.context=context;}
    protected void hook(){
        RecentlyPlayed.initialize(context);RemoveCreateButtonHook.registerSideButton("Recently played",-403,RecentlyPlayed::show);
        XposedHelpers.findAndHookMethod("com.spotify.player.model.AutoValue_PlayerState$Builder",lpparm.classLoader,"build",new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){if(p.getResult()!=null){RecentlyPlayed.observe(p.getResult());Api2Runtime.onPlayerState(p.getResult());}}});
    }
}
