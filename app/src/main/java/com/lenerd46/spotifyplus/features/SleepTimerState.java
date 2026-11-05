package com.lenerd46.spotifyplus.features;
import java.math.BigDecimal;
/** Monotonic deadlines and generation tokens prevent stale alarms from pausing playback. */
public final class SleepTimerState {
    private long generation,deadline;
    public static long minutes(String text,boolean hours){
        try{long minutes=new BigDecimal(text.trim()).multiply(BigDecimal.valueOf(hours?60:1)).longValueExact();
            if(minutes<=0||minutes>Integer.MAX_VALUE)throw new IllegalArgumentException();return minutes;
        }catch(Exception invalid){throw new IllegalArgumentException("Enter a positive whole number of minutes, such as 25 minutes or 1.5 hours.");}
    }
    public synchronized long start(long now,long minutes){if(minutes<=0)throw new IllegalArgumentException();deadline=Math.addExact(now,Math.multiplyExact(minutes,60000L));return ++generation;}
    public synchronized long remaining(long now){return deadline==0?0:Math.max(0,deadline-now);}
    public synchronized long deadline(){return deadline;}
    public synchronized boolean takeExpired(long token,long now){if(token!=generation||deadline==0||now<deadline)return false;deadline=0;generation++;return true;}
    public synchronized void cancel(){deadline=0;generation++;}
}
