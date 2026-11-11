package com.lenerd46.spotifyplus.features;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class SavedTimerDurationsTest {
    static final class Memory {
        List<Long> stored = List.of(5L, 10L);
        boolean fail;
        int writes;
        void save(List<Long> next) {
            writes++;
            if (fail) throw new IllegalStateException("Could not save timers");
            stored = List.copyOf(next);
        }
    }
    @Test public void failedAddRemainsUnsavedAndRetryActuallyPersists() {
        Memory memory = new Memory();
        SavedTimerDurations timers = new SavedTimerDurations(memory.stored, memory::save);
        memory.fail = true;
        assertThrows(IllegalStateException.class, () -> timers.add(25));
        assertEquals(List.of(5L, 10L), timers.list());
        assertEquals(timers.list(), memory.stored);
        memory.fail = false;
        timers.add(25);
        assertEquals(List.of(5L, 10L, 25L), memory.stored);
        assertEquals(2, memory.writes);
    }
    @Test public void failedRemoveAndMovePreserveOrderAndCanBeRetried() {
        Memory memory = new Memory();
        SavedTimerDurations timers = new SavedTimerDurations(memory.stored, memory::save);
        memory.fail = true;
        assertThrows(IllegalStateException.class, () -> timers.remove(0));
        assertEquals(memory.stored, timers.list());
        assertThrows(IllegalStateException.class, () -> timers.moveUp(1));
        assertEquals(memory.stored, timers.list());
        memory.fail = false;
        timers.moveUp(1);
        assertEquals(List.of(10L, 5L), memory.stored);
        timers.remove(0);
        assertEquals(List.of(5L), memory.stored);
    }
    @Test public void duplicatesAndFirstRowMoveDoNotWriteAndSnapshotsCannotMutateState() {
        Memory memory = new Memory();
        SavedTimerDurations timers = new SavedTimerDurations(memory.stored, memory::save);
        timers.add(5);timers.moveUp(0);
        assertEquals(0, memory.writes);
        assertThrows(UnsupportedOperationException.class, () -> timers.list().add(20L));
        assertThrows(IllegalArgumentException.class, () -> timers.add(0));
        assertEquals(memory.stored, timers.list());
    }
}
