package com.lenerd46.spotifyplus.api2;

import java.lang.reflect.*;
import java.util.*;

/** Builds Spotify's public model command; its normal handler runs the interceptors. */
public final class NativePlaybackCommand {
    private static final String MODEL="com.spotify.player.model.";
    private NativePlaybackCommand() {}
    public static Method dispatcher(ClassLoader loader,Class<?> owner) throws Exception {
        Class<?> command=type(loader,"command.PlayCommand"),single=Class.forName("io.reactivex.rxjava3.core.Single",true,loader);
        Method found=null;
        for(Method m:owner.getMethods()) if(!Modifier.isStatic(m.getModifiers()) && !m.isBridge() &&
                Arrays.equals(m.getParameterTypes(),new Class<?>[]{command}) && single.isAssignableFrom(m.getReturnType())) {
            if(found!=null) throw new IllegalStateException("Ambiguous PlayCommand handler");found=m;
        }
        if(found==null) throw new NoSuchMethodException("PlayCommand handler");found.setAccessible(true);return found;
    }
    public static Object prepare(ClassLoader loader,String source,List<String> uris,String prefix) throws Exception {
        List<Object> tracks=new ArrayList<>();
        for(int i=0;i<uris.size();i++) {
            Object b=staticCall(type(loader,"ContextTrack"),"builder",new Class<?>[]{String.class},uris.get(i));
            call(b,"uid",new Class<?>[]{String.class},prefix+i);tracks.add(call(b,"build",new Class<?>[]{}));
        }
        Object page=staticCall(type(loader,"ContextPage"),"builder",new Class<?>[]{});
        call(page,"tracks",new Class<?>[]{List.class},tracks);
        Object context=staticCall(type(loader,"Context"),"builder",new Class<?>[]{String.class},"");
        call(context,"pages",new Class<?>[]{List.class},List.of(call(page,"build",new Class<?>[]{})));
        Object origin=staticCall(type(loader,"PlayOrigin"),"builder",new Class<?>[]{String.class},"spotifyplus");
        call(origin,"viewUri",new Class<?>[]{String.class},source);
        Object overrides=staticCall(type(loader,"command.options.PlayerOptionOverrides"),"builder",new Class<?>[]{});
        call(overrides,"shufflingContext",new Class<?>[]{Boolean.class},Boolean.FALSE);
        Object options=staticCall(type(loader,"command.options.PreparePlayOptions"),"builder",new Class<?>[]{});
        call(options,"alwaysPlaySomething",new Class<?>[]{boolean.class},true);
        Object skip=staticCall(type(loader,"command.options.SkipToTrack"),"fromIndices",new Class<?>[]{Long.class,Long.class},0L,0L);
        call(options,"skipTo",new Class<?>[]{type(loader,"command.options.SkipToTrack")},skip);
        call(options,"playerOptionsOverride",new Class<?>[]{type(loader,"command.options.PlayerOptionOverrides")},call(overrides,"build",new Class<?>[]{}));
        Object command=staticCall(type(loader,"command.PlayCommand"),"builder",new Class<?>[]{type(loader,"Context"),type(loader,"PlayOrigin")},call(context,"build",new Class<?>[]{}),call(origin,"build",new Class<?>[]{}));
        call(command,"options",new Class<?>[]{type(loader,"command.options.PreparePlayOptions")},call(options,"build",new Class<?>[]{}));
        return call(command,"build",new Class<?>[]{});
    }
    private static Class<?> type(ClassLoader l,String name)throws Exception{return Class.forName(MODEL+name,true,l);}
    private static Object staticCall(Class<?> c,String n,Class<?>[] p,Object... a)throws Exception {Method m=c.getMethod(n,p);m.setAccessible(true);return m.invoke(null,a);}
    private static Object call(Object o,String n,Class<?>[] p,Object... a)throws Exception {Method m=o.getClass().getMethod(n,p);m.setAccessible(true);return m.invoke(o,a);}
}
