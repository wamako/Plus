package com.lenerd46.spotifyplus.features;
import com.google.gson.Gson;
import java.util.*;

/** Persistent local playback transitions; paused/browsed tracks are not recorded as played. */
public final class PlaybackHistory {
    public interface Storage{String read();void write(String json);}
    public static final class Entry {
        public BookmarkCollection.Item track; public long playedAt;
        public Entry(BookmarkCollection.Item track,long playedAt){this.track=track;this.playedAt=playedAt;}
    }
    private static final class State{BookmarkCollection.Item current;ArrayList<Entry> previous=new ArrayList<>();}
    private final Storage storage;private final Gson gson=new Gson();private State state;
    public PlaybackHistory(Storage storage){this.storage=storage;state=gson.fromJson(storage.read(),State.class);if(state==null)state=new State();if(state.previous==null)state.previous=new ArrayList<>();}
    public synchronized void observe(BookmarkCollection.Item track,boolean playing,long now){
        if(track==null||!playing)return;
        if(state.current!=null&&state.current.uri.equals(track.uri)){state.current=track;return;}
        State next=new State();next.current=track;next.previous=new ArrayList<>(state.previous);
        if(state.current!=null){next.previous.add(0,new Entry(state.current,now));if(next.previous.size()>100)next.previous.subList(100,next.previous.size()).clear();}
        storage.write(gson.toJson(next));state=next;
    }
    public synchronized List<Entry> entries(){return List.copyOf(state.previous);}
    public synchronized void importPrevious(List<BookmarkCollection.Item> tracks,long now){
        if(!state.previous.isEmpty()||tracks.isEmpty())return;
        State next=new State();next.current=state.current;
        // Native history describes play occurrences, not a collection of unique
        // songs. A repeated URI (even the current song) is still a previous play.
        for(int i=tracks.size()-1;i>=0&&next.previous.size()<100;i--)next.previous.add(new Entry(tracks.get(i),now));
        storage.write(gson.toJson(next));state=next;
    }
}
