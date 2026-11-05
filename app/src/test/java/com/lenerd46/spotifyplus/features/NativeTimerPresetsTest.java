package com.lenerd46.spotifyplus.features;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class NativeTimerPresetsTest {
    private Long key(String row){try{return Long.valueOf(row);}catch(NumberFormatException special){return null;}}
    @Test public void insertsExtrasBeforeNativeSpecialRowsAndDeduplicatesAmounts(){assertEquals(List.of("5","10","60","25","90","end","cancel"),NativeTimerPresets.merge(List.of("5","10","60","end","cancel"),List.of("25","60","90","25"),this::key));}
    @Test public void preservesAvailabilityAndOrderWhenNoCustomValuesExist(){List<String> rows=List.of("end");assertEquals(rows,NativeTimerPresets.merge(rows,List.of(),this::key));assertEquals(List.of("5","25"),NativeTimerPresets.merge(List.of("5"),List.of("25"),this::key));}
    @Test public void insetUpdatesDoNotAccumulateAndFollowNativeLayoutChanges(){assertEquals(30,HeaderInsetPosition.topMargin(0,0,0,30));assertEquals(30,HeaderInsetPosition.topMargin(0,30,30,30));assertEquals(6,HeaderInsetPosition.topMargin(0,30,54,30));assertEquals(0,HeaderInsetPosition.topMargin(0,6,50,30));assertEquals(4,HeaderInsetPosition.topMargin(4,4,50,30));}
}
