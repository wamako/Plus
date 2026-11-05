package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import static org.junit.Assert.*;
public class PlaybackHistoryTest {
    static final class Memory implements PlaybackHistory.Storage{String value="{}";public String read(){return value;}public void write(String json){value=json;}}
    static BookmarkCollection.Item track(char id){return new BookmarkCollection.Item("spotify:track:"+String.valueOf(id).repeat(22),"Song "+id,"Artist","");}
    @Test public void recordsPreviousSongOnceAndDoesNotCountPauses(){PlaybackHistory h=new PlaybackHistory(new Memory());h.observe(track('A'),true,1);h.observe(track('A'),false,2);h.observe(track('B'),false,3);assertTrue(h.entries().isEmpty());h.observe(track('B'),true,4);h.observe(track('B'),true,5);assertEquals(1,h.entries().size());assertEquals(track('A').uri,h.entries().get(0).track.uri);}
    @Test public void preservesHistoryAcrossProcessRestart(){Memory m=new Memory();PlaybackHistory h=new PlaybackHistory(m);h.observe(track('A'),true,1);PlaybackHistory resumed=new PlaybackHistory(m);resumed.observe(track('B'),true,2);assertEquals(track('A').uri,resumed.entries().get(0).track.uri);}
    @Test public void importsNativePreviousTracksNewestFirst(){PlaybackHistory h=new PlaybackHistory(new Memory());h.importPrevious(java.util.List.of(track('A'),track('B')),3);assertEquals(track('B').uri,h.entries().get(0).track.uri);h.importPrevious(java.util.List.of(track('C')),4);assertEquals(2,h.entries().size());}
}
