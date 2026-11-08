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
    public static Method dispatcher(ClassLoader loader,Class<?> owner) throws Exception {
        Class<?> command=Class.forName("com.spotify.player.model.command.SetQueueCommand",true,loader);
        Class<?> single=Class.forName("io.reactivex.rxjava3.core.Single",true,loader);Method found=null;
        for(Method method:owner.getMethods())if(!Modifier.isStatic(method.getModifiers())&&!method.isBridge()&&
                Arrays.equals(method.getParameterTypes(),new Class<?>[]{command})&&single.isAssignableFrom(method.getReturnType())) {
            if(found!=null)throw new IllegalStateException();found=method;
        }
        if(found==null)throw new NoSuchMethodException();found.setAccessible(true);return found;
    }
    public static boolean manual(Object track) throws Exception {
        return Boolean.parseBoolean(String.valueOf(((Map<?,?>)call(track,"metadata")).get("is_queued")))||"queue".equals(call(track,"provider"));
    }
    public static void requireNoManual(List<?> tracks) throws Exception {
        for(Object track:tracks)if(manual(track))throw ShuffleEngine.error("MANUAL_QUEUE");
    }
    // Only a typed Autoplay tail may be carried into this new single-track context.
    public static void requireAutoplayTail(List<?> tracks) throws Exception {
        for(Object track:tracks)if(manual(track)||!"autoplay".equals(call(track,"provider"))||
                !String.valueOf(call(track,"uri")).matches("spotify:track:[A-Za-z0-9]{22}"))throw ShuffleEngine.error("SEQUENCE_CHANGED");
    }
    public static Prepared prepareSelection(ClassLoader loader,String revision,List<String> remaining,List<?> previous,List<?> tail,Object delimiter) throws Exception {
        if(remaining.isEmpty()||remaining.size()>=ShuffleEngine.LIMIT)throw ShuffleEngine.error("LIMIT");
        requireAutoplayTail(tail);List<Object> next=new ArrayList<>();
        Class<?> model=Class.forName("com.spotify.player.model.ContextTrack",true,loader);
        for(String uri:remaining) {
            if(!uri.matches("spotify:track:[A-Za-z0-9]{22}"))throw ShuffleEngine.error("INPUT");
            Object builder=model.getMethod("builder",String.class).invoke(null,uri);
            call(builder,"provider",new Class<?>[]{String.class},"queue");
            call(builder,"metadata",new Class<?>[]{Map.class},Map.of("is_queued","true"));
            // Empty occurrence UID: native core assigns it when accepting a new item.
            next.add(call(builder,"build"));
        }
        next.addAll(tail);if(delimiter!=null)next.add(delimiter);
        return command(loader,revision,next,previous);
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
        return command(loader,revision,next,previous);
    }
    private static Prepared command(ClassLoader loader,String revision,List<Object> next,List<?> previous) throws Exception {
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
