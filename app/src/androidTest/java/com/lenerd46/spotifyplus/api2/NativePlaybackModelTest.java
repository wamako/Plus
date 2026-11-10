package com.lenerd46.spotifyplus.api2;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dalvik.system.DexClassLoader;
import java.io.File;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Pinned real model + serializer test. No client, account or service is constructed. */
@RunWith(AndroidJUnit4.class)
public class NativePlaybackModelTest {
    private static Object call(Object owner,String name,Class<?>[] parameters,Object... args)throws Exception {
        Method m=owner.getClass().getMethod(name,parameters);m.setAccessible(true);return m.invoke(owner,args);
    }
    private static Object get(Object owner,String name)throws Exception{return call(owner,name,new Class<?>[]{});}
    private static Object invoke(Method method,Object... args)throws Exception{method.setAccessible(true);return method.invoke(null,args);}
    private static Object value(Object optional)throws Exception{assertEquals(true,get(optional,"c"));return get(optional,"b");}
    private static byte[] contextWire(ClassLoader loader,Object context)throws Exception {
        Class<?> model=loader.loadClass("com.spotify.player.model.Context");
        Object proto=invoke(loader.loadClass("p.pkm1").getMethod("i",model),context);
        return (byte[])get(proto,"toByteArray");
    }
    private static long varint(byte[] data,int[] offset) {
        long value=0;for(int shift=0;shift<64;shift+=7){assertTrue(offset[0]<data.length);int b=data[offset[0]++]&255;value|=(long)(b&127)<<shift;if((b&128)==0)return value;}
        throw new AssertionError("Malformed fixture wire value");
    }
    private static Map<Integer,List<Object>> fields(byte[] data) {
        Map<Integer,List<Object>> result=new HashMap<>();int[] offset={0};
        while(offset[0]<data.length){long key=varint(data,offset);int number=(int)(key>>>3);Object v;
            if((key&7)==0)v=varint(data,offset);
            else {assertEquals(2,key&7);int size=Math.toIntExact(varint(data,offset));assertTrue(size>=0&&size<=data.length-offset[0]);v=Arrays.copyOfRange(data,offset[0],offset[0]+size);offset[0]+=size;}
            result.computeIfAbsent(number,k->new ArrayList<>()).add(v);
        }
        return result;
    }
    private static byte[] blob(Map<Integer,List<Object>> data,int number){assertTrue("Missing wire field "+number,data.containsKey(number));return (byte[])data.get(number).get(0);}
    private static String string(Map<Integer,List<Object>> data,int number){return data.containsKey(number)?new String(blob(data,number),StandardCharsets.UTF_8):"";}
    private static ClassLoader models()throws Exception {
        var context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File apk=new File(context.getFilesDir(),"spotify-model.apk");assertTrue(apk.isFile());assertFalse(apk.canWrite());
        return new DexClassLoader(apk.getAbsolutePath(),context.getCodeCacheDir().getAbsolutePath(),null,context.getClassLoader());
    }
    @Test public void explicitPlaybackSerializesLikeNativeTrackListFactory()throws Exception {
        ClassLoader loader=models();
        String source="spotify:album:0000000000000000000009";
        List<String> uris=List.of("spotify:track:0000000000000000000002","spotify:track:0000000000000000000001","spotify:track:0000000000000000000002");
        Object command=NativePlaybackCommand.prepare(loader,source,uris), supplied=get(command,"context");
        // Independent oracle: native single-track context; original album is origin only.
        Class<?> model=loader.loadClass("com.spotify.player.model.Context");Method factory=null;
        for(Method m:model.getMethods())if(m.getName().equals("fromTrackUris"))factory=m;
        assertNotNull(factory);Class<?> immutable=factory.getParameterTypes()[1];
        Object list=invoke(immutable.getMethod("p",Collection.class),List.of(uris.get(0)));
        Object expected=invoke(factory,uris.get(0),list);
        byte[] wire=contextWire(loader,supplied);assertArrayEquals(contextWire(loader,expected),wire);
        var encoded=fields(wire);assertEquals(uris.get(0),string(encoded,3));assertEquals("",string(encoded,4));
        assertEquals(1,encoded.get(1).size());var page=fields(blob(encoded,1));assertEquals(1,page.get(1).size());
        for(int i=0;i<1;i++){var track=fields((byte[])page.get(1).get(i));assertEquals(uris.get(i),string(track,1));assertEquals("",string(track,2));}
        Object options=value(get(command,"options"));assertEquals(false,value(get(options,"initiallyPaused")));assertEquals(false,get(get(options,"alwaysPlaySomething"),"c"));
        Object skip=value(get(options,"skipTo"));assertEquals(0L,value(get(skip,"trackIndex")));assertEquals(0L,value(get(skip,"pageIndex")));
        Object overrides=value(get(options,"playerOptionsOverride"));assertEquals(false,value(get(overrides,"repeatingTrack")));assertEquals(false,value(get(overrides,"repeatingContext")));assertEquals(false,value(get(overrides,"shufflingContext")));
        Object encodedOptions=invoke(loader.loadClass("p.x7e0").getMethod("r",loader.loadClass("com.spotify.player.model.command.options.PreparePlayOptions")),options);
        var optionFields=fields((byte[])get(encodedOptions,"toByteArray"));
        assertNotNull(blob(fields(blob(optionFields,3)),5));
        assertNotNull(blob(fields(blob(optionFields,7)),1));
    }
    private static Object providedTrack(ClassLoader loader,String uri,String provider,boolean queued)throws Exception {
        Class<?> model=loader.loadClass("com.spotify.player.model.ContextTrack");
        Object builder=invoke(model.getMethod("builder",String.class),uri);
        call(builder,"metadata",new Class<?>[]{Map.class},Map.of("is_queued",Boolean.toString(queued)));
        Object proto=invoke(loader.loadClass("p.xam").getMethod("b",model),get(builder,"build"));
        Class<?> supplied=loader.loadClass("com.spotify.player.esperanto.proto.EsProvidedTrack$ProvidedTrack");
        Object wrapper=invoke(supplied.getMethod("r"));
        call(wrapper,"n",new Class<?>[]{proto.getClass()},proto);call(wrapper,"q",new Class<?>[]{String.class},provider);
        return invoke(loader.loadClass("p.xam").getMethod("a",supplied),get(wrapper,"build"));
    }
    @Test public void verifiesAutoplayOnlyAfterCompleteSelectionUsingActualProviderDecode()throws Exception {
        ClassLoader loader=models();String a="spotify:track:0000000000000000000001",b="spotify:track:0000000000000000000002",extra="spotify:track:0000000000000000000009";
        List<String> expected=List.of(a,b,a);
        Object current=providedTrack(loader,a,"context",false),first=providedTrack(loader,b,"context",false),second=providedTrack(loader,a,"context",false),tail=providedTrack(loader,extra,"autoplay",false);
        assertEquals("autoplay",get(tail,"provider"));
        var result=CollectionOrder.inspect(current,List.of(first,second,tail),expected);
        assertTrue(result.matches);assertTrue(result.selectionCompleteInWindow);assertEquals(1,result.autoplayTailCount);
        for(String provider:List.of("context","queue","unknown"))assertFalse(CollectionOrder.inspect(current,List.of(first,second,providedTrack(loader,extra,provider,false)),expected).matches);
        assertFalse(CollectionOrder.inspect(current,List.of(first,second,providedTrack(loader,extra,"autoplay",true)),expected).matches);
        result=CollectionOrder.inspect(current,List.of(first,providedTrack(loader,a,"autoplay",false),tail),expected);
        assertTrue(result.matches);assertEquals(1,result.autoplayInSelectionCount);
        assertFalse(CollectionOrder.inspect(current,List.of(first,tail,second),expected).matches);
        assertFalse(CollectionOrder.inspect(current,List.of(second,first,tail),expected).matches);
    }
}
