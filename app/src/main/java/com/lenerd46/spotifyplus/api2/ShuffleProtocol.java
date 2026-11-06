package com.lenerd46.spotifyplus.api2;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Independent encoding of the 9.1.94 schema, checked before any native write. */
public final class ShuffleProtocol {
    private static final String PROTO="com.spotify.player.esperanto.proto.";
    private ShuffleProtocol() {}
    public static Object play(ClassLoader loader,String context,List<String> uris) throws Exception {
        check(loader,"EsContextTrack$ContextTrack","URI",1);
        check(loader,"EsContextPage$ContextPage","TRACKS",1);
        check(loader,"EsContext$Context","PAGES",1); check(loader,"EsContext$Context","URI",3);
        check(loader,"EsOptional$OptionalInt64","VALUE",1);
        check(loader,"EsOptional$OptionalBoolean","VALUE",1);
        check(loader,"EsSkipToTrack$SkipToTrack","TRACK_INDEX",5);
        check(loader,"EsContextPlayerOptions$ContextPlayerOptionOverrides","SHUFFLING_CONTEXT",1);
        check(loader,"EsPreparePlayOptions$PreparePlayOptions","SKIP_TO",3);
        check(loader,"EsPreparePlayOptions$PreparePlayOptions","PLAYER_OPTIONS_OVERRIDE",7);
        check(loader,"EsPreparePlay$PreparePlayRequest","CONTEXT",1);
        check(loader,"EsPreparePlay$PreparePlayRequest","OPTIONS",2);
        check(loader,"EsPlay$PlayRequest","PREPARE_PLAY_REQUEST",1);
        Wire page=new Wire();
        for(String uri:uris) page.message(1,new Wire().text(1,uri).bytes());
        byte[] source=new Wire().message(1,page.bytes()).text(3,context).bytes();
        // Explicit page, no URL that could cause Spotify to reload/reorder the source.
        byte[] skip=new Wire().message(5,new Wire().integer(1,0).bytes()).bytes();
        byte[] override=new Wire().message(1,new Wire().integer(1,0).bytes()).bytes();
        byte[] options=new Wire().message(3,skip).message(7,override).bytes();
        byte[] prepare=new Wire().message(1,source).message(2,options).bytes();
        return parse(type(loader,"EsPlay$PlayRequest"),new Wire().message(1,prepare).bytes());
    }
    public static Class<?> response(ClassLoader loader) throws Exception {
        check(loader,"EsResponseWithReasons$ResponseWithReasons","ERROR",1);
        Class<?> type=type(loader,"EsResponseWithReasons$ResponseWithReasons");
        field(type,"error_"); parse(type,new byte[0]); return type;
    }
    public static int result(Class<?> type,byte[] bytes) throws Exception {
        if(bytes==null || bytes.length>1024*1024) throw new IllegalStateException();
        // A zero-byte protobuf response is the valid default OK enum (0).
        return field(type,"error_").getInt(parse(type,bytes));
    }
    private static void check(ClassLoader loader,String name,String key,int expected) throws Exception {
        if(type(loader,name).getField(key+"_FIELD_NUMBER").getInt(null)!=expected) throw new IllegalStateException();
    }
    private static Class<?> type(ClassLoader loader,String name) throws Exception { return Class.forName(PROTO+name,true,loader); }
    private static Field field(Class<?> type,String name) throws Exception { Field f=type.getDeclaredField(name);f.setAccessible(true);return f; }
    private static Object parse(Class<?> type,byte[] bytes) throws Exception {
        Object instance=field(type,"DEFAULT_INSTANCE").get(null);
        for(Class<?> base=type.getSuperclass();base!=null;base=base.getSuperclass()) for(Method method:base.getDeclaredMethods()) {
            Class<?>[] p=method.getParameterTypes();
            if(Modifier.isStatic(method.getModifiers()) && method.getName().equals("parseFrom") && p.length==2 && p[0]==base && p[1]==byte[].class) {
                method.setAccessible(true); return method.invoke(null,instance,bytes);
            }
        }
        throw new NoSuchMethodException();
    }
    private static final class Wire {
        final ByteArrayOutputStream out=new ByteArrayOutputStream();
        void varint(long v){while((v&~127L)!=0){out.write((int)(v&127)|128);v>>>=7;}out.write((int)v);}
        Wire integer(int key,int v){varint((long)key<<3);varint(v);return this;}
        Wire text(int key,String s){return message(key,s.getBytes(StandardCharsets.UTF_8));}
        Wire message(int key,byte[] b){varint(((long)key<<3)|2);varint(b.length);out.write(b,0,b.length);return this;}
        byte[] bytes(){return out.toByteArray();}
    }
}
