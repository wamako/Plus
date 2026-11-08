package com.lenerd46.spotifyplus.api2;

import java.lang.reflect.Method;
import java.util.*;

/** Verifies the selected sequence; only a typed Autoplay tail may follow it. */
public final class CollectionOrder {
    private CollectionOrder() {}
    public static final class Assessment {
        public final boolean matches,prefixMatches,selectionCompleteInWindow,autoplayTailOnly;
        public final int expectedUpcomingCount,matchingUpcomingPrefixCount,autoplayInSelectionCount,autoplayTailCount,contextTailCount,queuedTailCount,otherTailCount,delimiterTailCount;
        private Assessment(boolean currentMatches,boolean prefixMatches,int available,int expected,int matching,int inSelection,int autoplay,int context,int queued,int other,int delimiters) {
            this.prefixMatches=prefixMatches;expectedUpcomingCount=expected;matchingUpcomingPrefixCount=matching;
            autoplayInSelectionCount=inSelection;selectionCompleteInWindow=matching==expected;
            autoplayTailCount=autoplay;contextTailCount=context;queuedTailCount=queued;otherTailCount=other;delimiterTailCount=delimiters;
            autoplayTailOnly=context==0&&queued==0&&other==0;
            matches=currentMatches&&prefixMatches&&(expected==0||available>0)&&autoplayTailOnly;
        }
    }
    public static Assessment inspect(Object current,List<?> upcoming,List<String> expected) throws Exception {
        if(expected.isEmpty())throw new IllegalArgumentException("Empty selection");
        int remaining=expected.size()-1,available=Math.min(remaining,upcoming.size()),matching=0;
        while(matching<available&&expected.get(matching+1).equals(call(upcoming.get(matching),"uri")))matching++;
        int inSelection=0;for(int i=0;i<available;i++)if("autoplay".equals(call(upcoming.get(i),"provider")))inSelection++;
        int autoplay=0,context=0,queued=0,other=0,delimiters=0;
        // Extras are considered only after every requested upcoming position.
        // A wrong/missing requested position can never be hidden as Autoplay.
        for(int i=remaining;i<upcoming.size();i++) {
            Object track=upcoming.get(i),uri=call(track,"uri");
            if("spotify:delimiter".equals(uri)||"spotify:meta:delimiter".equals(uri)) {
                delimiters++;
                if(delimiters>1||(i!=remaining&&i!=upcoming.size()-1))other++;
                continue;
            }
            Object provider=call(track,"provider");
            boolean manuallyQueued=Boolean.parseBoolean(String.valueOf(((Map<?,?>)call(track,"metadata")).get("is_queued")));
            if(manuallyQueued||"queue".equals(provider))queued++;
            else if("autoplay".equals(provider)&&uri instanceof String&&((String)uri).matches("spotify:track:[A-Za-z0-9]{22}"))autoplay++;
            else if("context".equals(provider))context++;
            else other++;
        }
        return new Assessment(current!=null&&expected.get(0).equals(call(current,"uri")),matching==available,
                available,remaining,matching,inSelection,autoplay,context,queued,other,delimiters);
    }
    private static Object call(Object owner,String name) throws Exception {
        Method method=owner.getClass().getMethod(name);method.setAccessible(true);return method.invoke(owner);
    }
}
