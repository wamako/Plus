package com.lenerd46.spotifyplus.compat;

import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class SpotifyCallbackTest {
    public interface Function1 { Object invoke(Object argument); }
    public interface Function2 { Object invoke(Object first, Object second); }

    @Test public void drawerCallbackSupportsTwoSpotifyArguments() {
        AtomicInteger calls = new AtomicInteger();
        Object unit = new Object();
        Function2 callback = (Function2) SpotifyCallback.create(
                getClass().getClassLoader(), Function2.class, unit, calls::incrementAndGet);
        assertSame(unit, callback.invoke("spotify:null", new Object()));
        assertEquals(1, calls.get());
    }

    @Test public void spotifyFunctionInvokesOnlyModuleActionAndReturnsSpotifyUnit() {
        AtomicInteger calls = new AtomicInteger();
        Object unit = new Object();
        Function1 callback = (Function1) SpotifyCallback.create(
                getClass().getClassLoader(), Function1.class, unit, calls::incrementAndGet);
        assertSame(unit, callback.invoke(new Object()));
        assertEquals(1, calls.get());
        assertTrue(callback.equals(callback));
        assertFalse(callback.equals(new Object()));
        assertEquals(System.identityHashCode(callback), callback.hashCode());
        assertEquals("SpotifyPlus callback", callback.toString());
        assertEquals(1, calls.get());
    }
}
