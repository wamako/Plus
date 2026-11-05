package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import static org.junit.Assert.*;
public class GlassTargetsTest {
    @Test public void identifiesNativeSurfacesWithoutTouchingArtworkOrText(){
        assertEquals("player",GlassTargets.category("android.widget.FrameLayout","now_playing_bar",false));
        assertEquals("headers",GlassTargets.category("com.google.android.material.appbar.AppBarLayout","",false));
        assertEquals("menus",GlassTargets.category("android.widget.LinearLayout","context_menu_root",false));
        assertEquals("player",GlassTargets.category("android.widget.FrameLayout","navigation_bar",false));
        assertNull(GlassTargets.category("android.widget.FrameLayout","navigation_bar_window_insets_space",false));
        assertNull(GlassTargets.category("android.widget.FrameLayout","now_playing_bar_anchor_item",false));
        assertNull(GlassTargets.category("android.widget.ImageView","cover_art",true));
        assertNull(GlassTargets.category("android.widget.TextView","title",false));
    }
}
