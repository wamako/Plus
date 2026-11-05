package com.lenerd46.spotifyplus;
import org.junit.Test;
import static org.junit.Assert.*;
public class ArtworkSourceTest {
    private static final String ID="ab67616d0000b27332a7d87248d1b75463483df5";
    @Test public void normalizesSpotifyAndHttpArtwork(){
        assertEquals("https://i.scdn.co/image/"+ID,ArtworkSource.url("spotify:image:"+ID));
        assertEquals(ID,ArtworkSource.id("spotify:image:"+ID));
        assertEquals(ID,ArtworkSource.id("https://i.scdn.co/image/"+ID));
        assertEquals("https://example.com/art.jpg",ArtworkSource.id("https://example.com/art.jpg"));
        assertEquals("https://i.scdn.co/image/"+ID,ArtworkSource.url(ID));
    }
    @Test public void missingArtworkNeverSubstitutesAnotherAlbum(){
        assertNull(ArtworkSource.url(null));assertNull(ArtworkSource.url(""));
        assertNull(ArtworkSource.url("spotify:image:"));assertEquals("",ArtworkSource.id(null));
    }
}
