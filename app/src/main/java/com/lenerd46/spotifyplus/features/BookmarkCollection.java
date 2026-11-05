package com.lenerd46.spotifyplus.features;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.util.*;
import java.util.regex.*;

/** Ordered, URI-deduplicated saved items. Persistence is committed before state changes. */
public final class BookmarkCollection {
    public interface Storage { String read(); void write(String json); }
    public static final class Item {
        public String uri, title, artist, artwork, type;
        public Item(String uri, String title, String artist, String artwork) {
            this.uri = normalize(uri);
            this.type = this.uri.split(":")[1];
            this.title = title == null || title.isBlank() ? this.uri : title;
            this.artist = artist == null ? "" : artist;
            this.artwork = artwork == null ? "" : artwork;
        }
    }
    public static final class Removed {
        public final Item item;
        public final int index;
        Removed(Item item, int index) { this.item = item; this.index = index; }
    }
    private final Storage storage;
    private final Gson gson = new Gson();
    private List<Item> items;
    public BookmarkCollection(Storage storage) {
        this.storage = storage;
        List<Item> loaded = gson.fromJson(storage.read(), new TypeToken<List<Item>>(){}.getType());
        items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (loaded != null) for (Item item : loaded) {
            if (item == null) continue;
            try {
                Item clean = new Item(item.uri, item.title, item.artist, item.artwork);
                if (seen.add(clean.uri)) items.add(clean);
            } catch (IllegalArgumentException invalid) { /* Ignore invalid imported rows. */ }
        }
    }
    public static String normalize(String input) {
        if (input == null) throw new IllegalArgumentException("A Spotify song, album or artist is required");
        String value = input.trim();
        Matcher link = Pattern.compile("https://open\\.spotify\\.com/(?:intl-[a-z-]+/)?(track|album|artist)/([A-Za-z0-9]{22})(?:[?#].*)?").matcher(value);
        if (link.matches()) value = "spotify:" + link.group(1) + ":" + link.group(2);
        if (!value.matches("spotify:(track|album|artist):[A-Za-z0-9]{22}"))
            throw new IllegalArgumentException("Use a Spotify song, album or artist link");
        return value;
    }
    public synchronized List<Item> list(String type) {
        List<Item> result = new ArrayList<>();
        for (Item item : items) if ("all".equals(type) || item.type.equals(type)) result.add(new Item(item.uri, item.title, item.artist, item.artwork));
        return Collections.unmodifiableList(result);
    }
    public synchronized boolean add(Item item) {
        if (items.stream().anyMatch(i -> i.uri.equals(item.uri))) return false;
        List<Item> next = new ArrayList<>(items); next.add(new Item(item.uri, item.title, item.artist, item.artwork)); commit(next); return true;
    }
    public synchronized Removed remove(String uri) {
        for (int i = 0; i < items.size(); i++) if (items.get(i).uri.equals(uri)) {
            List<Item> next = new ArrayList<>(items); Item item = next.remove(i); commit(next); return new Removed(item, i);
        }
        return null;
    }
    public synchronized boolean undo(Removed removed) {
        if (removed == null || items.stream().anyMatch(i -> i.uri.equals(removed.item.uri))) return false;
        List<Item> next = new ArrayList<>(items); next.add(Math.min(removed.index, next.size()), removed.item); commit(next); return true;
    }
    public synchronized boolean move(String uri, int direction) {
        if (direction != -1 && direction != 1) throw new IllegalArgumentException("Move one position at a time");
        for (int i = 0; i < items.size(); i++) if (items.get(i).uri.equals(uri)) {
            int target = i + direction;
            if (target < 0 || target >= items.size()) return false;
            List<Item> next = new ArrayList<>(items); Collections.swap(next, i, target); commit(next); return true;
        }
        return false;
    }
    private void commit(List<Item> next) { storage.write(gson.toJson(next)); items = next; }
}
