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
    @Test public void explicitSelectionUsesRealQueueProviderSerializationAndKeepsAutoplay() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File apk=new File(context.getFilesDir(),"spotify-model.apk");assertTrue(apk.isFile());assertFalse(apk.canWrite());
        ClassLoader loader=new DexClassLoader(apk.getAbsolutePath(),context.getCodeCacheDir().getAbsolutePath(),null,context.getClassLoader());
        String uri="spotify:track:0000000000000000000001";
        Object tail=track(loader,"spotify:track:0000000000000000000009","native-autoplay",false);
        Object b=get(tail,"toBuilder");call(b,"provider",new Class<?>[]{String.class},"autoplay");tail=get(b,"build");
        Object prev=track(loader,uri,"history",false);
        var result=NativeQueueCommand.prepareSelection(loader,"42",List.of(uri,uri),List.of(prev),List.of(tail),null);
        assertEquals("42",get(result.command,"queueRevision"));assertEquals(List.of(prev),get(result.command,"prevTracks"));assertEquals(3,result.next.size());assertSame(tail,result.next.get(2));
        Class<?> track=loader.loadClass("com.spotify.player.model.ContextTrack");
        for(int i=0;i<2;i++) {
            Object selected=result.next.get(i);assertEquals(uri,get(selected,"uri"));assertEquals("",get(selected,"uid"));assertEquals("",get(selected,"provider"));assertEquals("true",((Map<?,?>)get(selected,"metadata")).get("is_queued"));
            Object fresh=get(track.getMethod("builder",String.class).invoke(null,uri),"build");
            Method queued=loader.loadClass("p.nmt0").getDeclaredMethod("e",track,boolean.class);queued.setAccessible(true);
            assertEquals(queued.invoke(null,fresh,true),selected);
            // Actual queue serializer and reverse decoder, not a fixture substitute.
            Method encode=loader.loadClass("p.xam").getMethod("c",track);encode.setAccessible(true);Object proto=encode.invoke(null,selected);
            Method decode=loader.loadClass("p.xam").getMethod("a",proto.getClass());decode.setAccessible(true);Object decoded=decode.invoke(null,proto);
            assertEquals(uri,get(decoded,"uri"));assertEquals("",get(decoded,"provider"));assertEquals("true",((Map<?,?>)get(decoded,"metadata")).get("is_queued"));
        }
        assertTrue(CollectionOrder.inspect(track(loader,uri,"current",false),result.next,List.of(uri,uri,uri)).matches);
    }

    private static Object privateNew(Class<?> type,Class<?>[] parameters,Object... args) throws Exception {
        var constructor=type.getDeclaredConstructor(parameters);constructor.setAccessible(true);return constructor.newInstance(args);
    }
    private static Object privateCall(Object owner,String name,Class<?>[] types,Object... args) throws Exception {
        var method=owner.getClass().getDeclaredMethod(name,types);method.setAccessible(true);return method.invoke(owner,args);
    }
    private static void expectedReadbackFailure(Object watch,String method,long nanos,String code) throws Exception {
        try {privateCall(watch,method,new Class<?>[]{long.class},nanos);fail("Initial replay cannot confirm a write");}
        catch(java.lang.reflect.InvocationTargetException error){assertEquals("SP_SHUFFLE_"+code,error.getCause().getMessage());}
    }
    @Test public void productionObserverWaitsForActualAsyncRxReplayWithoutConfirmingAWrite() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File apk=new File(context.getFilesDir(),"spotify-model.apk");assertTrue(apk.isFile());assertFalse(apk.canWrite());
        ClassLoader loader=new DexClassLoader(apk.getAbsolutePath(),context.getCodeCacheDir().getAbsolutePath(),null,context.getClassLoader());
        Class<?> flow=loader.loadClass("io.reactivex.rxjava3.core.Flowable"),consumer=loader.loadClass("io.reactivex.rxjava3.functions.Consumer");
        Class<?> behavior=loader.loadClass("io.reactivex.rxjava3.processors.BehaviorProcessor");
        Object processor=behavior.getMethod("e0",Object.class).invoke(null,"initial");
        // Pinned Spotify retains optimized Rx methods, not the unshrunk API names.
        Class<?> schedulerClass=loader.loadClass("io.reactivex.rxjava3.core.Scheduler");
        Object scheduler=privateNew(loader.loadClass("io.reactivex.rxjava3.internal.schedulers.SingleScheduler"),new Class<?>[]{});
        Object stream=privateNew(loader.loadClass("io.reactivex.rxjava3.internal.operators.flowable.FlowableDelay"),new Class<?>[]{flow,long.class,schedulerClass},processor,80L,scheduler);
        var unit=stream.getClass().getDeclaredField("d");unit.setAccessible(true);assertEquals(java.util.concurrent.TimeUnit.MILLISECONDS,unit.get(stream));
        Class<?> backend=Class.forName("com.lenerd46.spotifyplus.api2.ShufflePlusBridge$NativeBackend");
        Class<?> watcher=Class.forName(backend.getName()+"$Watch"),auditClass=Class.forName(backend.getName()+"$Audit"),match=Class.forName(backend.getName()+"$Match");
        Object owner=privateNew(backend,new Class<?>[]{ClassLoader.class},loader);
        var subscribe=flow.getMethod("subscribe",consumer,consumer);
        Object watch=privateNew(watcher,new Class<?>[]{backend,Object.class,Class.class,Method.class},owner,stream,consumer,subscribe);
        Object audit=privateNew(auditClass,new Class<?>[]{String.class},"collection");
        privateCall(audit,"put",new Class<?>[]{String.class,Object.class},"stage","selected-queue");
        var callbackThread=new java.util.concurrent.atomic.AtomicReference<Thread>();
        Object matcher=java.lang.reflect.Proxy.newProxyInstance(match.getClassLoader(),new Class<?>[]{match},(proxy,method,args)->{if(method.getName().equals("test")){callbackThread.set(Thread.currentThread());return true;}throw new UnsupportedOperationException();});
        try {
            privateCall(watch,"start",new Class<?>[]{match,auditClass},matcher,audit);
            assertEquals("initial",privateCall(watch,"initial",new Class<?>[]{long.class},java.util.concurrent.TimeUnit.SECONDS.toNanos(3L)));
            assertNotSame(Thread.currentThread(),callbackThread.get());
            assertEquals(false,privateCall(audit,"get",new Class<?>[]{String.class},"sent"));
            assertEquals(0,privateCall(audit,"get",new Class<?>[]{String.class},"postDispatchEvents"));
            assertEquals(true,privateCall(audit,"get",new Class<?>[]{String.class},"queueInitialStateReceived"));
            privateCall(watch,"dispatching",new Class<?>[]{});
            expectedReadbackFailure(watch,"confirmNanos",0L,"UNCONFIRMED_READBACK");
            behavior.getMethod("onNext",Object.class).invoke(processor,"edited");
            privateCall(watch,"confirmNanos",new Class<?>[]{long.class},java.util.concurrent.TimeUnit.SECONDS.toNanos(3L));
            assertEquals("edited",privateCall(watch,"latest",new Class<?>[]{}));
            assertEquals(1,privateCall(audit,"get",new Class<?>[]{String.class},"postDispatchEvents"));
        } finally {privateCall(watch,"close",new Class<?>[]{});}
        assertEquals(false,behavior.getMethod("f0").invoke(processor));
        Class<?> publish=loader.loadClass("io.reactivex.rxjava3.processors.PublishProcessor");
        Object silent=privateNew(publish,new Class<?>[]{});
        watch=privateNew(watcher,new Class<?>[]{backend,Object.class,Class.class,Method.class},owner,silent,consumer,subscribe);
        audit=privateNew(auditClass,new Class<?>[]{String.class},"collection");
        try {
            privateCall(watch,"start",new Class<?>[]{match,auditClass},matcher,audit);
            expectedReadbackFailure(watch,"initial",0L,"UNCONFIRMED_INITIAL_STATE");
            assertEquals(false,privateCall(audit,"get",new Class<?>[]{String.class},"sent"));
            assertEquals(true,privateCall(audit,"get",new Class<?>[]{String.class},"initialStateTimedOut"));
        } finally {privateCall(watch,"close",new Class<?>[]{});}
        var subscribers=publish.getDeclaredField("b");subscribers.setAccessible(true);
        assertEquals(0,java.lang.reflect.Array.getLength(((java.util.concurrent.atomic.AtomicReference<?>)subscribers.get(silent)).get()));
    }

}
