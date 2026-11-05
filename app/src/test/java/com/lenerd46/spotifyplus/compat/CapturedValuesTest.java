package com.lenerd46.spotifyplus.compat;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class CapturedValuesTest {
    static final class Track{}
    static final class TwoCaptures{Object service,track;TwoCaptures(Object service,Object track){this.service=service;this.track=track;}}
    static final class Capture{Object value;Capture(Object value){this.value=value;}}
    @Test public void acceptsDirectlyCapturedTrackAndOldSingletonList(){Track t=new Track();assertSame(t,CapturedValues.find(new Capture(t),Track.class,4));assertSame(t,CapturedValues.find(new Capture(List.of(t)),Track.class,4));}
    @Test public void prefersMenuTrackOverUnrelatedTrackInsideService(){Track target=new Track();assertSame(target,CapturedValues.find(new TwoCaptures(new Capture(new Track()),target),Track.class,6));}
    @Test public void rejectsMultipleSelectionAndTerminatesCycles(){assertNull(CapturedValues.find(new Capture(List.of(new Track(),new Track())),Track.class,4));Capture c=new Capture(null);c.value=c;assertNull(CapturedValues.find(c,Track.class,8));}
}
