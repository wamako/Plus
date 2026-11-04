package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import static org.junit.Assert.*;
public class MenuEntityFinderTest {
    static final class Target{String uri;Object child;Target(String uri){this.uri=uri;}}
    @Test public void findsAlbumsAndArtistsWithoutAcceptingAmbiguousTargets(){
        Target album=new Target("spotify:album:1234567890123456789012");assertEquals(album.uri,MenuEntityFinder.uniqueUri(album));
        album.child=new Target("spotify:artist:2234567890123456789012");assertNull(MenuEntityFinder.uniqueUri(album));
        album.child=album;assertEquals(album.uri,MenuEntityFinder.uniqueUri(album));
    }
}
