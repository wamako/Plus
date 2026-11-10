package com.lenerd46.spotifyplus.api2;

import android.content.*;
import android.content.pm.*;
import android.net.Uri;

/** Resolve before handing a navigation request to Android. */
public final class NavigationIntents {
    private NavigationIntents() {}
    public static Intent create(Context context,String raw,String target) {
        if(raw==null||raw.isBlank()||!("spotify".equals(target)||"auto".equals(target)||"external".equals(target)))return null;
        Uri uri=Uri.parse(raw.trim());String scheme=uri.getScheme();
        boolean spotify="spotify".equalsIgnoreCase(scheme)||("https".equalsIgnoreCase(scheme)&&"open.spotify.com".equalsIgnoreCase(uri.getHost()));
        boolean web="http".equalsIgnoreCase(scheme)||"https".equalsIgnoreCase(scheme);
        if(!spotify&&!web||"spotify".equals(target)&&!spotify||"external".equals(target)&&!web)return null;
        Intent intent=new Intent(Intent.ACTION_VIEW,uri);
        if(!"external".equals(target)&&spotify) {
            intent.setPackage("com.spotify.music");
            if(raw.equals("spotify:now-playing")||raw.equals("spotify:now-playing-view")) {
                intent=new Intent().setClassName("com.spotify.music","com.spotify.nowplaying.musicinstallation.NowPlayingActivity");
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
                intent.putExtra("EXTRA_SHARED_ELEMENT_TRANSITION",false);
            }
        } else {
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            ResolveInfo browser=context.getPackageManager().resolveActivity(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN,Intent.CATEGORY_APP_BROWSER),PackageManager.MATCH_DEFAULT_ONLY);
            if(browser==null||browser.activityInfo==null)return null;
            intent.setPackage(browser.activityInfo.packageName);
        }
        return intent.resolveActivity(context.getPackageManager())==null?null:intent;
    }
}
