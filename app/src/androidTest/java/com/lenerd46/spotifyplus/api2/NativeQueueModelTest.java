package com.lenerd46.spotifyplus.api2;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import dalvik.system.DexClassLoader;
import java.io.File;
import java.lang.reflect.Method;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual supplied Spotify model/builders, without account or service calls. */
@RunWith(AndroidJUnit4.class)
public class NativeQueueModelTest {
    private static Object call(Object value,String name,Class<?>[] types,Object... args) throws Exception {
        Method method=value.getClass().getMethod(name,types);method.setAccessible(true);return method.invoke(value,args);
    }
    private static Object get(Object value,String name) throws Exception{return call(value,name,new Class<?>[]{});}
    private static Object track(ClassLoader loader,String uri,String uid,boolean queued) throws Exception {
        Class<?> model=Class.forName("com.spotify.player.model.ContextTrack",true,loader);
        Object builder=model.getMethod("builder",String.class).invoke(null,uri);
        call(builder,"uid",new Class<?>[]{String.class},uid);
        call(builder,"metadata",new Class<?>[]{Map.class},Map.of("title","CI fixture","is_queued",Boolean.toString(queued)));
        return get(builder,"build");
    }
    @Test public void buildsNativeEditorOptionsAndSectionMarkersUsingRealSpotifyModels() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File apk=new File(context.getFilesDir(),"spotify-model.apk");assertTrue(apk.isFile());assertFalse(apk.canWrite());
        ClassLoader loader=new DexClassLoader(apk.getAbsolutePath(),context.getCodeCacheDir().getAbsolutePath(),null,context.getClassLoader());
        Class<?> flow=Class.forName("io.reactivex.rxjava3.core.Flowable",false,loader);
        Class<?> consumer=Class.forName("io.reactivex.rxjava3.functions.Consumer",false,loader);
        Class<?> disposable=Class.forName("io.reactivex.rxjava3.disposables.Disposable",false,loader);
        assertEquals(disposable,flow.getMethod("subscribe",consumer,consumer).getReturnType());
        assertEquals(void.class,disposable.getMethod("dispose").getReturnType());
        String uri="spotify:track:0000000000000000000001";
        Object a=track(loader,uri,"ci-occurrence-a",true),b=track(loader,uri,"ci-occurrence-b",false);
        Object previous=track(loader,"spotify:track:0000000000000000000002","ci-previous",false);
        assertEquals(1,NativeQueueCommand.queuedSlots(List.of(a,b)));
        NativeQueueCommand.Prepared result=NativeQueueCommand.prepare(loader,"42",List.of(b,a),List.of(previous),1,null);
        assertEquals("42",get(result.command,"queueRevision"));
        assertEquals(List.of(previous),get(result.command,"prevTracks"));
        assertEquals(result.next,get(result.command,"nextTracks"));
        Object options=get(result.command,"options");assertEquals(true,get(options,"c"));
        Object override=get(get(options,"b"),"overrideRestrictions");assertEquals(true,get(override,"c"));assertEquals(Boolean.TRUE,get(override,"b"));
        assertEquals("ci-occurrence-b",get(result.next.get(0),"uid"));assertEquals("ci-occurrence-a",get(result.next.get(1),"uid"));
        assertEquals(uri,get(result.next.get(0),"uri"));assertEquals(uri,get(result.next.get(1),"uri"));
        assertEquals(get(b,"provider"),get(result.next.get(0),"provider"));
        assertEquals("true",((Map<?,?>)get(result.next.get(0),"metadata")).get("is_queued"));
        assertEquals("false",((Map<?,?>)get(result.next.get(1),"metadata")).get("is_queued"));
        assertEquals("true",((Map<?,?>)get(a,"metadata")).get("is_queued"));
        assertEquals("false",((Map<?,?>)get(b,"metadata")).get("is_queued"));
    }
}
