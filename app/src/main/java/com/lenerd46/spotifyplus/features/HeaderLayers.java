package com.lenerd46.spotifyplus.features;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.view.*;
import java.util.*;
/** One header backdrop behind the avatar and category row; retain the individual chip fills. */
public final class HeaderLayers {
    private static final Map<View,Saved> saved=new WeakHashMap<>();
    private static final class Saved {final Drawable background;final ColorStateList tint;Saved(View v){background=v.getBackground();tint=v.getBackgroundTintList();}}
    private HeaderLayers(){}
    public static boolean isHomeHeader(View root){
        String name="";try{if(root.getId()!=View.NO_ID)name=root.getResources().getResourceEntryName(root.getId());}catch(Exception ignored){}
        if(name.equals("filter_chips_container")||name.equals("filters_container"))return true;
        if(root instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++)if(isHomeHeader(group.getChildAt(i)))return true;
        return false;
    }
    public static void apply(View root,boolean glass){if(isHomeHeader(root)){HomeHeaderInsets.observe(root);visit(root,glass);}}
    private static void visit(View root,boolean glass){
        String name="";try{if(root.getId()!=View.NO_ID)name=root.getResources().getResourceEntryName(root.getId());}catch(Exception ignored){}
        if(name.equals("filter_chips_container")||name.equals("filter_row")||name.equals("filter_row_start_gradient")||name.equals("gradient")){
            if(glass){saved.computeIfAbsent(root,Saved::new);root.setBackgroundTintList(null);root.setBackground(null);}
            else{Saved original=saved.remove(root);if(original!=null){root.setBackground(original.background);root.setBackgroundTintList(original.tint);}}
        }
        if(root instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++)visit(group.getChildAt(i),glass);
    }
}
