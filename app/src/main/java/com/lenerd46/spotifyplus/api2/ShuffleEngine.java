package com.lenerd46.spotifyplus.api2;

import java.util.*;
import java.util.function.LongSupplier;

/** Bounded, expiring, single-use previews. Reading/preparing never changes playback. */
public final class ShuffleEngine {
    public static final int LIMIT = 10000;
    private static final long TTL = 120000;
    public interface Backend {
        Snapshot read();
        Object preparePlay(Snapshot snapshot, String context, List<String> uris);
        void play(Object prepared);
        void replace(Snapshot snapshot, List<Item> order);
    }
    public static final class Item {
        public final String uri, title, artist;
        public final Object nativeTrack;
        public Item(String uri, String title, String artist, Object nativeTrack) {
            this.uri=uri; this.title=title; this.artist=artist; this.nativeTrack=nativeTrack;
        }
    }
    public static final class Snapshot {
        public final Object owner;
        public final String revision, fingerprint;
        public final boolean shuffled;
        public final List<Item> next;
        public final List<?> previous;
        public final Object delimiter;
        public Snapshot(Object owner, String revision, String fingerprint, boolean shuffled,
                        List<Item> next, List<?> previous, Object delimiter) {
            this.owner=owner; this.revision=revision; this.fingerprint=fingerprint; this.shuffled=shuffled;
            this.next=List.copyOf(next); this.previous=List.copyOf(previous); this.delimiter=delimiter;
        }
    }
    public static final class Plan {
        public final String ticket = UUID.randomUUID().toString();
        public final String mode;
        public final List<Item> tracks;
        final Snapshot snapshot;
        final Object playback;
        final long created;
        Plan(String mode, Snapshot snapshot, List<Item> tracks, Object playback, long now) {
            this.mode=mode; this.snapshot=snapshot; this.tracks=List.copyOf(tracks); this.playback=playback; created=now;
        }
    }
    private final Backend backend;
    private final LongSupplier clock;
    private final LinkedHashMap<String,Plan> plans = new LinkedHashMap<>();
    private final LinkedHashSet<String> used = new LinkedHashSet<>();
    public ShuffleEngine(Backend backend, LongSupplier clock) { this.backend=backend; this.clock=clock; }
    public synchronized Plan queue() {
        Snapshot state=backend.read();
        if (state.shuffled) throw error("SHUFFLE_ON");
        validateCount(state.next.size());
        for (Item item:state.next) validateTrack(item.uri);
        return remember(new Plan("queue",state,state.next,null,clock.getAsLong()));
    }
    public synchronized Plan collection(String context, List<String> uris) {
        if (context == null || !context.matches("spotify:(?:playlist|album|track):[A-Za-z0-9]{22}|spotify:collection:tracks"))
            throw error("INPUT");
        validateCount(uris.size());
        for (String uri:uris) validateTrack(uri);
        Snapshot state=backend.read();
        Object playback=backend.preparePlay(state,context,List.copyOf(uris));
        List<Item> items=new ArrayList<>();
        for(String uri:uris) items.add(new Item(uri,uri,"",null));
        return remember(new Plan("collection",state,items,playback,clock.getAsLong()));
    }
    private Plan remember(Plan plan) {
        plans.values().removeIf(p -> clock.getAsLong()-p.created > TTL);
        while(plans.size()>=2) plans.remove(plans.keySet().iterator().next());
        plans.put(plan.ticket,plan); return plan;
    }
    public synchronized int apply(String ticket, List<Integer> permutation) {
        if (used.contains(ticket)) throw error("USED");
        Plan plan=plans.remove(ticket);
        if (plan==null || clock.getAsLong()-plan.created>TTL) throw error("EXPIRED");
        // Consume even on a rejected/stale attempt. A caller must prepare a new preview.
        used.add(ticket); while(used.size()>128) used.remove(used.iterator().next());
        if(permutation.size()!=plan.tracks.size()) throw error("INPUT");
        boolean[] seen=new boolean[permutation.size()]; List<Item> order=new ArrayList<>();
        for(Integer index:permutation) {
            if(index==null || index<0 || index>=seen.length || seen[index]) throw error("INPUT");
            seen[index]=true; order.add(plan.tracks.get(index));
        }
        Snapshot current=backend.read();
        if(current.owner!=plan.snapshot.owner || !current.revision.equals(plan.snapshot.revision) ||
                !current.fingerprint.equals(plan.snapshot.fingerprint) || current.shuffled!=plan.snapshot.shuffled)
            throw error("STALE");
        if(plan.mode.equals("queue")) backend.replace(current,order);
        else {
            // Collection order was fixed at prepare time, so callers cannot alter it on Apply.
            for(int i=0;i<permutation.size();i++) if(permutation.get(i)!=i) throw error("INPUT");
            backend.play(plan.playback);
        }
        return order.size();
    }
    private static void validateCount(int size) { if(size<1 || size>LIMIT) throw error("LIMIT"); }
    private static void validateTrack(String uri) {
        if(uri==null || !uri.matches("spotify:track:[A-Za-z0-9]{22}")) throw error("UNSUPPORTED_ITEM");
    }
    public static IllegalStateException error(String code) { return new IllegalStateException("SP_SHUFFLE_"+code); }
}
