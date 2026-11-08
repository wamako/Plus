package com.lenerd46.spotifyplus.api2;

import java.lang.reflect.*;
import java.util.*;

/** Mirrors the model options and section markers used by Spotify's queue editor. */
public final class NativeQueueCommand {
    private NativeQueueCommand() {}
    public static final class Prepared {
        public final Object command;
        public final List<Object> next;
        Prepared(Object command,List<Object> next){this.command=command;this.next=List.copyOf(next);}
    }
    public static int queuedSlots(List<?> original) throws Exception {
        int count=0;boolean context=false;
        for(Object track:original) {
            boolean queued=Boolean.parseBoolean(String.valueOf(((Map<?,?>)call(track,"metadata")).get("is_queued")));
            if(queued&&context)throw ShuffleEngine.error("QUEUE_LAYOUT");
            if(queued)count++;else context=true;
        }
        return count;
    }
    @SuppressWarnings("unchecked")
    public static Prepared prepare(ClassLoader loader,String revision,List<?> requested,List<?> previous,int queuedSlots,Object delimiter) throws Exception {
        if(queuedSlots<0||queuedSlots>requested.size())throw ShuffleEngine.error("INPUT");
        List<Object> next=new ArrayList<>();
        for(int i=0;i<requested.size();i++) {
            Object track=requested.get(i);
            Map<String,String> metadata=new LinkedHashMap<>((Map<String,String>)call(track,"metadata"));
            metadata.put("is_queued",Boolean.toString(i<queuedSlots));
            Object builder=call(track,"toBuilder");
            call(builder,"metadata",new Class<?>[]{Map.class},metadata);
            next.add(call(builder,"build"));
        }
        if(delimiter!=null)next.add(delimiter);
        Class<?> options=Class.forName("com.spotify.player.model.command.options.CommandOptions",true,loader);
        Object optionBuilder=options.getMethod("builder").invoke(null);
        call(optionBuilder,"overrideRestrictions",new Class<?>[]{boolean.class},true);
        Object commandOptions=call(optionBuilder,"build");
        Class<?> command=Class.forName("com.spotify.player.model.command.SetQueueCommand",true,loader);
        Object builder=command.getMethod("builder",String.class,List.class,List.class).invoke(null,revision,next,previous);
        call(builder,"options",new Class<?>[]{options},commandOptions);
        return new Prepared(call(builder,"build"),next);
    }
    private static Object call(Object owner,String name) throws Exception{return call(owner,name,new Class<?>[]{});}
    private static Object call(Object owner,String name,Class<?>[] parameters,Object... args) throws Exception {
        Method method=owner.getClass().getMethod(name,parameters);method.setAccessible(true);return method.invoke(owner,args);
    }
}
