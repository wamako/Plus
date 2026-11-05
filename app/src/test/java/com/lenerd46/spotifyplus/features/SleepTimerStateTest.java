package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import static org.junit.Assert.*;
public class SleepTimerStateTest {
    @Test public void parsesWholeMinutesAndFractionalHours(){assertEquals(25,SleepTimerState.minutes("25",false));assertEquals(90,SleepTimerState.minutes("1.5",true));for(String value:new String[]{"","0","-1","0.5","NaN","2147483648"}){try{SleepTimerState.minutes(value,false);fail(value);}catch(IllegalArgumentException expected){}}}
    @Test public void replacedAndCancelledCallbacksCannotFire(){SleepTimerState s=new SleepTimerState();long old=s.start(1000,5),current=s.start(2000,10);assertFalse(s.takeExpired(old,601000));assertFalse(s.takeExpired(current,601999));assertTrue(s.takeExpired(current,602000));assertFalse(s.takeExpired(current,602001));long cancelled=s.start(700000,1);s.cancel();assertFalse(s.takeExpired(cancelled,800000));assertEquals(0,s.remaining(800000));}
    @Test public void deadlineUsesElapsedTimeAndHandlesOverflow(){SleepTimerState s=new SleepTimerState();s.start(1000,1);assertEquals(61000,s.deadline());assertEquals(30000,s.remaining(31000));try{s.start(Long.MAX_VALUE,1);fail();}catch(ArithmeticException expected){}assertEquals(61000,s.deadline());}
}
