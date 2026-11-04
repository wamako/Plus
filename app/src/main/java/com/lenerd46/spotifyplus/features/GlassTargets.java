package com.lenerd46.spotifyplus.features;
import java.util.Locale;
public final class GlassTargets {
    private GlassTargets(){}
    public static String category(String className,String resourceName,boolean clickable){
        String id=resourceName.toLowerCase(Locale.ROOT),name=className.toLowerCase(Locale.ROOT);
        if(id.contains("now_playing_bar")||id.contains("miniplayer")||id.contains("mini_player")||id.contains("bottom_navigation"))return "player";
        if(id.contains("context_menu")||id.contains("contextmenu")||id.contains("side_drawer")||id.contains("sidedrawer"))return "menus";
        if(name.endsWith("appbarlayout")||id.equals("toolbar")||id.endsWith("_toolbar"))return "headers";
        if(clickable&&(id.startsWith("settings_")||id.endsWith("_card")||name.endsWith("materialcardview")))return "cards";
        return null;
    }
}
