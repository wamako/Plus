package com.lenerd46.spotifyplus.api2;

import android.app.Activity;
import android.content.*;
import com.lenerd46.spotifyplus.References;

/** Copies only the explicitly whitelisted, identity-free diagnostic report. */
public final class ShuffleDiagnosticsUi {
    private ShuffleDiagnosticsUi() {}
    public static boolean copy(String report) {
        Activity activity=References.currentActivity;
        if(activity==null||activity.isFinishing()||activity.isDestroyed())return false;
        activity.runOnUiThread(()->{
            try {
                android.content.ClipboardManager clipboard=(android.content.ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("Shuffle+ diagnostics",report));
                com.lenerd46.spotifyplus.features.FeatureSheets.toast("Shuffle diagnostics copied");
            } catch(RuntimeException error){com.lenerd46.spotifyplus.features.FeatureSheets.toast("Could not copy diagnostics");}
        });
        return true;
    }
}
