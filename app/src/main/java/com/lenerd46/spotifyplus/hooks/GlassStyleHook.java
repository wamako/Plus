package com.lenerd46.spotifyplus.hooks;
import android.content.Context;
import android.view.View;
import com.lenerd46.spotifyplus.features.GlassStyle;
import de.robv.android.xposed.*;
public final class GlassStyleHook extends SpotifyHook {
    private final Context context;
    public GlassStyleHook(Context context){this.context=context;}
    protected void hook(){
        GlassStyle.initialize(context);
        XposedHelpers.findAndHookMethod(android.app.Activity.class,"onResume",new XC_MethodHook(){
            protected void afterHookedMethod(MethodHookParam p){GlassStyle.observe((android.app.Activity)p.thisObject);}
        });
        XposedHelpers.findAndHookMethod(View.class,"onAttachedToWindow",new XC_MethodHook(){
            protected void afterHookedMethod(MethodHookParam p){try{GlassStyle.apply((View)p.thisObject);}catch(Throwable error){XposedBridge.log("[SpotifyPlus][Glass] "+error);}}
        });
    }
}
