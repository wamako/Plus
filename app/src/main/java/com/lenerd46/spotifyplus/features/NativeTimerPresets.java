package com.lenerd46.spotifyplus.features;
import java.util.*;
import java.util.function.Function;
/** Retain native duration/special rows, inserting only new saved durations before special rows. */
public final class NativeTimerPresets {
    private NativeTimerPresets(){}
    public static <T> List<T> merge(List<T> nativeRows,List<T> customRows,Function<T,Long> duration){
        Set<Long> seen=new HashSet<>();for(T row:nativeRows){Long key=duration.apply(row);if(key!=null)seen.add(key);}
        List<T> extra=new ArrayList<>();for(T row:customRows){Long key=duration.apply(row);if(key!=null&&seen.add(key))extra.add(row);}
        List<T> result=new ArrayList<>();boolean inserted=false;
        for(T row:nativeRows){if(!inserted&&duration.apply(row)==null){result.addAll(extra);inserted=true;}result.add(row);}
        if(!inserted)result.addAll(extra);return result;
    }
}
