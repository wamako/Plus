package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class BookmarkCollectionTest {
    static final String A="spotify:track:1234567890123456789012", B="spotify:album:2234567890123456789012", C="spotify:artist:3234567890123456789012";
    static final class Memory implements BookmarkCollection.Storage {
        String json="[]"; boolean fail;
        public String read(){return json;}
        public void write(String json){if(fail)throw new IllegalStateException("disk full");this.json=json;}
    }
    static BookmarkCollection.Item item(String uri){return new BookmarkCollection.Item(uri,"Title","Artist","");}
    @Test public void bookmarksPersistWithoutDuplicatesAndFilterByType(){
        Memory m=new Memory();BookmarkCollection c=new BookmarkCollection(m);
        assertTrue(c.add(item(A)));assertFalse(c.add(item(A)));c.add(item(B));c.add(item(C));
        BookmarkCollection restored=new BookmarkCollection(m);
        assertEquals(3,restored.list("all").size());assertEquals(B,restored.list("album").get(0).uri);
    }
    @Test public void reorderRemoveAndUndoPreserveGlobalOrder(){
        BookmarkCollection c=new BookmarkCollection(new Memory());c.add(item(A));c.add(item(B));c.add(item(C));
        assertTrue(c.move(C,-1));assertEquals(C,c.list("all").get(1).uri);
        BookmarkCollection.Removed r=c.remove(C);assertTrue(c.undo(r));assertFalse(c.undo(r));
        assertEquals(C,c.list("all").get(1).uri);
    }
    @Test public void failedWriteDoesNotEraseExistingBookmarks(){
        Memory m=new Memory();BookmarkCollection c=new BookmarkCollection(m);c.add(item(A));m.fail=true;
        try{c.remove(A);fail("Expected failed save");}catch(IllegalStateException expected){}
        assertEquals(A,c.list("all").get(0).uri);
    }
    @Test public void spotifyLinksNormalizeAndOtherLinksAreRejected(){
        assertEquals(A,BookmarkCollection.normalize("https://open.spotify.com/track/1234567890123456789012?si=abc"));
        try{BookmarkCollection.normalize("https://example.com/track/1234567890123456789012");fail();}catch(IllegalArgumentException expected){}
    }
}
