package com.lenerd46.spotifyplus.features;

import java.util.*;
import java.util.function.Consumer;

/** Commit saved durations before publishing changes to the timer manager. */
public final class SavedTimerDurations {
    private final ArrayList<Long> values;
    private final Consumer<List<Long>> save;

    public SavedTimerDurations(List<Long> initial, Consumer<List<Long>> save) {
        values = new ArrayList<>(initial);
        this.save = save;
    }
    public List<Long> list() { return List.copyOf(values); }
    public void add(long minutes) {
        if (minutes <= 0 || minutes > Integer.MAX_VALUE) throw new IllegalArgumentException("Invalid timer duration");
        if (values.contains(minutes)) return;
        List<Long> next = new ArrayList<>(values);
        next.add(minutes);
        commit(next);
    }
    public void remove(int index) {
        List<Long> next = new ArrayList<>(values);
        next.remove(index);
        commit(next);
    }
    public void moveUp(int index) {
        if (index <= 0 || index >= values.size()) return;
        List<Long> next = new ArrayList<>(values);
        Collections.swap(next, index, index - 1);
        commit(next);
    }
    private void commit(List<Long> next) {
        save.accept(List.copyOf(next));
        values.clear();
        values.addAll(next);
    }
}
