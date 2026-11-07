package com.lenerd46.spotifyplus.api2;

import android.content.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NavigationIntentsTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void resolvesTrackToInstalledPatchedSpotify() {
        String uri="spotify:track:0000000000000000000001";
        Intent intent=NavigationIntents.create(context,uri,"spotify");assertNotNull("Patched Spotify must be installed for this test",intent);
        assertEquals(Intent.ACTION_VIEW,intent.getAction());assertEquals(uri,intent.getDataString());assertEquals("com.spotify.music",intent.getPackage());
        assertEquals("com.spotify.music",intent.resolveActivity(context.getPackageManager()).getPackageName());
    }
    @Test public void rejectsUnsupportedTargetsAndUnsafeSchemes() {
        for(String uri:new String[]{"javascript:alert(1)","file:///data/private","content://private","","not-a-uri"})assertNull(NavigationIntents.create(context,uri,"spotify"));
        assertNull(NavigationIntents.create(context,"https://example.com","spotify"));
        assertNull(NavigationIntents.create(context,"spotify:track:0000000000000000000001","external"));
        assertNull(NavigationIntents.create(context,"https://example.com","unknown"));
    }
}
