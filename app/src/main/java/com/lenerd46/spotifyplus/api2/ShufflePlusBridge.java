package com.lenerd46.spotifyplus.api2;

import com.lenerd.spotifyplus.module.Utils;
import com.lenerd.spotifyplus.module.hooks.PlayerHook;
import com.lenerd46.spotifyplus.player.NextUpQueue;
import org.json.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Async API-2 operations used only when a Shuffle+ page explicitly requests them. */
public final class ShufflePlusBridge {
    private static ShuffleEngine engine;
    private static ClassLoader engineLoader;
    private static volatile Map<String,Object> lastReport=Map.of();
    private static JSONObject report() throws JSONException {JSONObject value=new JSONObject();for(var entry:lastReport.entrySet())value.put(entry.getKey(),entry.getValue());return value;}
    private ShufflePlusBridge() {}
    public static synchronized Object execute(ClassLoader loader,String operation,JSONObject args) throws Exception {
        if(operation.equals("shuffleplus.diagnostics")) return report();
        if(operation.equals("shuffleplus.copyDiagnostics")) return !lastReport.isEmpty()&&ShuffleDiagnosticsUi.copy(report().toString());
        if(operation.equals("shuffleplus.capabilities")) return new JSONObject().put("queueMode","native-editor-options").put("version",1).put("host",18).put("collectionMode","source-page-native-uids").put("route","native-play-command").put("playerReady",PlayerHook.contextPlayer!=null).put("binding",PlayerHook.playBinding).put("limit",ShuffleEngine.LIMIT);
        if(engine==null || engineLoader!=loader) {
            engineLoader=loader;
            engine=new ShuffleEngine(new NativeBackend(loader),android.os.SystemClock::elapsedRealtime);
        }
        try {
            if(operation.equals("shuffleplus.apply")) {
                lastReport=Map.of("host",18,"outcome","not_sent");
                JSONArray input=args.getJSONArray("order");
                if(input.length()>ShuffleEngine.LIMIT) throw ShuffleEngine.error("LIMIT");
                List<Integer> order=new ArrayList<>();
                for(int i=0;i<input.length();i++) {
                    Object value=input.get(i);
                    if(!(value instanceof Number) || ((Number)value).doubleValue()!=((Number)value).intValue()) throw ShuffleEngine.error("INPUT");
                    order.add(((Number)value).intValue());
                }
                return new JSONObject().put("applied",engine.apply(args.getString("ticket"),order)).put("verification","visible-order");
            }
            ShuffleEngine.Plan plan;
            if(operation.equals("shuffleplus.queue")) plan=engine.queue();
            else if(operation.equals("shuffleplus.prepare")) {
                JSONArray input=args.getJSONArray("uris");
                if(input.length()>ShuffleEngine.LIMIT) throw ShuffleEngine.error("LIMIT");
                List<String> uris=new ArrayList<>();
                for(int i=0;i<input.length();i++) uris.add(input.getString(i));
                plan=engine.collection(args.getString("context"),uris);
            } else throw ShuffleEngine.error("UNSUPPORTED");
            JSONArray tracks=new JSONArray();
            if(plan.mode.equals("queue")) for(ShuffleEngine.Item track:plan.tracks)
                tracks.put(new JSONObject().put("uri",track.uri).put("title",track.title).put("artist",track.artist));
            return new JSONObject().put("ticket",plan.ticket).put("mode",plan.mode).put("count",plan.tracks.size())
                    .put("expiresInSeconds",120).put("tracks",tracks);
        } catch(JSONException error) { throw ShuffleEngine.error("INPUT"); }
        catch(IllegalStateException error) {
            if(!operation.equals("shuffleplus.apply"))throw error;
            Map<String,Object> updated=new LinkedHashMap<>(lastReport);
            String code=error.getMessage();if(code!=null&&code.matches("SP_SHUFFLE_[A-Z_]+"))updated.put("errorCode",code);
            lastReport=Collections.unmodifiableMap(updated);throw error;
        }
    }

    private static final class NativeBackend implements ShuffleEngine.Backend {
        final ClassLoader loader;
        NativeBackend(ClassLoader loader){this.loader=loader;}
        public ShuffleEngine.Snapshot read() {
            try {
                Object repo=NextUpQueue.currentRepository();
                if(repo==null || Utils.playerState==null) throw new IllegalStateException();
                Class<?> flow=type("io.reactivex.rxjava3.core.Flowable"), single=type("io.reactivex.rxjava3.core.Single");
                Object stream=uniqueField(repo,flow);
                Method reader=null;
                for(Method m:stream.getClass().getMethods())
                    if(!Modifier.isStatic(m.getModifiers()) && !m.isBridge() && m.getParameterCount()==0 && single.isAssignableFrom(m.getReturnType())) {
                        if(reader!=null) throw new IllegalStateException(); reader=m;
                    }
                if(reader==null) throw new NoSuchMethodException();
                Object state=await(reader.invoke(stream),5L);
                String revision=(String)call(state,"revision");
                if(revision==null || revision.isEmpty()) throw new IllegalStateException();
                List<?> next=(List<?>)call(state,"nextTracks"), previous=(List<?>)call(state,"prevTracks");
                if(next.size()>ShuffleEngine.LIMIT+1) throw ShuffleEngine.error("LIMIT");
                List<ShuffleEngine.Item> items=new ArrayList<>();Object delimiter=null;
                for(int i=0;i<next.size();i++) {
                    Object t=next.get(i);String uri=(String)call(t,"uri");
                    if("spotify:delimiter".equals(uri) && i==next.size()-1){delimiter=t;continue;}
                    Map<?,?> metadata=(Map<?,?>)call(t,"metadata");
                    items.add(new ShuffleEngine.Item(uri,label(metadata.get("title"),uri,180),label(metadata.get("artist_name"),"",140),t));
                }
                Object options=call(Utils.playerState,"options");
                boolean shuffled=(Boolean)call(options,"shufflingContext");
                String fingerprint=QueueIdentity.fingerprint(state);
                return new ShuffleEngine.Snapshot(repo,revision,fingerprint,shuffled,items,previous,delimiter,call(state,"track"));
            } catch(Exception | LinkageError error){throw controlled(error,"READY");}
        }
        public Object preparePlay(ShuffleEngine.Snapshot snapshot,String context,List<String> uris) {
            try {
                Object target=PlayerHook.contextPlayer;
                if(target==null) throw ShuffleEngine.error("PLAYER_READY");
                Object request=NativePlaybackCommand.prepare(loader,context,uris);
                Method dispatch=NativePlaybackCommand.dispatcher(loader,target.getClass());
                type("io.reactivex.rxjava3.core.Single").getMethod("timeout",long.class,TimeUnit.class);
                type("io.reactivex.rxjava3.core.Single").getMethod("blockingGet");
                return new Play(target,dispatch,request,watch(snapshot.owner),List.copyOf(uris));
            } catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
        }
        public void play(Object value) {
            Play p=(Play)value;
            if(p.client!=PlayerHook.contextPlayer) throw ShuffleEngine.error("STALE_PLAYER");
            Audit audit=new Audit("collection");audit.put("expectedTrackCount",p.uris.size());audit.put("requestFormat","source-page-native-uids");
            try {
                p.watch.start(state -> {
                    audit.put("observedNextCount",((List<?>)call(state,"nextTracks")).size());
                    Object current=call(state,"track");boolean present=(Boolean)call(current,"c");
                    audit.put("currentPresent",present);
                    audit.put("currentUriMatches",present&&p.uris.get(0).equals(call(call(current,"b"),"uri")));
                    audit.put("currentUidAssigned",present&&!String.valueOf(call(call(current,"b"),"uid")).isEmpty());
                    boolean matches=collectionMatches(state,p.uris);audit.put("visibleOrderMatches",matches);return matches;
                },audit);
                audit.put("sent",true);audit.put("outcome","unknown");
                Object result;
                try {result=await(p.rpc.invoke(p.client,p.request));}
                catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
                String status=String.valueOf(result);
                if(status.startsWith("Failure")){audit.put("reply","refused");audit.put("outcome","refused");throw ShuffleEngine.error("PLAY_REFUSED");}
                if(!status.startsWith("Success"))throw ShuffleEngine.error("ACK");
                audit.put("reply","success");p.watch.confirm();audit.put("outcome","confirmed");
            } finally {p.watch.close();audit.publish();}
        }
        public void replace(ShuffleEngine.Snapshot snapshot,List<ShuffleEngine.Item> order) {
            Method dispatch;Watch observer;NativeQueueCommand.Prepared prepared;String expected;int queuedSlots;
            try {
                List<Object> original=new ArrayList<>();for(ShuffleEngine.Item item:snapshot.next)original.add(item.nativeTrack);
                queuedSlots=NativeQueueCommand.queuedSlots(original);
                List<Object> tracks=new ArrayList<>();for(ShuffleEngine.Item item:order)tracks.add(item.nativeTrack);
                prepared=NativeQueueCommand.prepare(loader,snapshot.revision,tracks,snapshot.previous,queuedSlots,snapshot.delimiter);
                expected=QueueIdentity.fingerprint(snapshot.current,snapshot.previous,prepared.next);
                Class<?> command=type("com.spotify.player.model.command.SetQueueCommand");
                dispatch=null;
                for(Method method:snapshot.owner.getClass().getMethods())
                    if(!Modifier.isStatic(method.getModifiers())&&!method.isBridge()&&Arrays.equals(method.getParameterTypes(),new Class<?>[]{command})&&
                            type("io.reactivex.rxjava3.core.Single").isAssignableFrom(method.getReturnType())) {
                        if(dispatch!=null)throw new IllegalStateException();dispatch=method;
                    }
                if(dispatch==null)throw new NoSuchMethodException();dispatch.setAccessible(true);
                observer=watch(snapshot.owner);
            } catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
            Audit audit=new Audit("queue");audit.put("expectedNextCount",prepared.next.size());audit.put("queuedSlots",queuedSlots);
            audit.put("nativeEditorOptions",true);
            try {
                observer.start(state -> {
                    String identity=QueueIdentity.fingerprint(state);
                    List<?> observed=(List<?>)call(state,"nextTracks");
                    audit.put("observedNextCount",observed.size());
                    audit.put("queueUnchanged",snapshot.fingerprint.equals(identity));
                    audit.put("revisionChanged",!snapshot.revision.equals(call(state,"revision")));
                    audit.put("currentMatches",QueueIdentity.fingerprint(snapshot.current,List.of(),List.of()).equals(QueueIdentity.fingerprint(call(state,"track"),List.of(),List.of())));
                    audit.put("historyMatches",QueueIdentity.fingerprint(snapshot.current,snapshot.previous,List.of()).equals(QueueIdentity.fingerprint(snapshot.current,(List<?>)call(state,"prevTracks"),List.of())));
                    audit.put("uriOrderMatches",sameField(prepared.next,observed,"uri"));
                    audit.put("uidOrderMatches",sameField(prepared.next,observed,"uid"));
                    boolean matches=expected.equals(identity);audit.put("visibleOrderMatches",matches);return matches;
                },audit);
                audit.put("sent",true);audit.put("outcome","unknown");
                Object result;
                try {result=await(dispatch.invoke(snapshot.owner,prepared.command));}
                catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
                String status=String.valueOf(result);
                if(status.startsWith("Failure")){audit.put("reply","refused");audit.put("outcome","refused");throw ShuffleEngine.error("CONFLICT");}
                if(!status.startsWith("Success"))throw ShuffleEngine.error("ACK");
                audit.put("reply","success");observer.confirm();audit.put("outcome","confirmed");
            } finally {observer.close();audit.publish();}
        }
        private static boolean sameField(List<?> expected,List<?> observed,String name) throws Exception {
            if(expected.size()!=observed.size())return false;
            for(int i=0;i<expected.size();i++)if(!Objects.equals(call(expected.get(i),name),call(observed.get(i),name)))return false;
            return true;
        }
        // A real subscription starts before dispatch, rather than a lazy read afterward.
        private Watch watch(Object repository) throws Exception {
            Class<?> flow=type("io.reactivex.rxjava3.core.Flowable"),consumer=type("io.reactivex.rxjava3.functions.Consumer");
            Object stream=uniqueField(repository,flow);Method subscribe=null;
            for(Method method:flow.getMethods()) if(!Modifier.isStatic(method.getModifiers())&&!method.isBridge()&&
                    Arrays.equals(method.getParameterTypes(),new Class<?>[]{consumer,consumer})&&
                    type("io.reactivex.rxjava3.disposables.Disposable").isAssignableFrom(method.getReturnType())) {
                if(subscribe!=null)throw new IllegalStateException();subscribe=method;
            }
            if(subscribe==null)throw new NoSuchMethodException();subscribe.setAccessible(true);
            return new Watch(stream,consumer,subscribe);
        }
        private static boolean collectionMatches(Object state,List<String> uris) throws Exception {
            Object optional=call(state,"track");
            if(!(Boolean)call(optional,"c")) return false;
            Object current=call(optional,"b");
            if(!uris.get(0).equals(call(current,"uri"))) return false;
            List<?> next=(List<?>)call(state,"nextTracks");
            int index=1;
            for(int i=0;i<next.size();i++) {
                Object track=next.get(i);
                if("spotify:delimiter".equals(call(track,"uri")) && i==next.size()-1) break;
                if(index>=uris.size() || !uris.get(index).equals(call(track,"uri"))) return false;
                index++;
            }
            // Spotify exposes a window, not necessarily the full 10,000-song
            // context. Verify every exposed occurrence and require an upcoming
            // song for multi-song playback; never claim full-list readback.
            return uris.size()==1 || index>1;
        }
        private interface Match {boolean test(Object state) throws Exception;}
        private static final class Audit {
            final Map<String,Object> values=new LinkedHashMap<>();
            Audit(String mode){put("host",18);put("mode",mode);put("sent",false);put("outcome","not_sent");put("eventsObserved",0);put("postDispatchEvents",0);}
            synchronized void put(String key,Object value){values.put(key,value);}
            synchronized Object get(String key){return values.get(key);}
            synchronized void event(){values.put("eventsObserved",((Number)values.get("eventsObserved")).intValue()+1);if(Boolean.TRUE.equals(values.get("sent")))values.put("postDispatchEvents",((Number)values.get("postDispatchEvents")).intValue()+1);}
            synchronized void publish(){lastReport=Collections.unmodifiableMap(new LinkedHashMap<>(values));}
        }
        private final class Watch {
            final Object stream;final Class<?> consumer;final Method subscribe;
            final Object monitor=new Object();boolean matched,failed,closed;
            Object disposable;Audit audit;
            Watch(Object stream,Class<?> consumer,Method subscribe){this.stream=stream;this.consumer=consumer;this.subscribe=subscribe;}
            Object callback(java.util.function.Consumer<Object> action) {
                return Proxy.newProxyInstance(loader,new Class<?>[]{consumer},(proxy,method,args)->{
                    if(method.getName().equals("accept")){action.accept(args[0]);return null;}
                    if(method.getName().equals("toString"))return "SpotifyPlusShuffleObserver";
                    if(method.getName().equals("hashCode"))return System.identityHashCode(proxy);
                    if(method.getName().equals("equals"))return proxy==args[0];
                    throw new UnsupportedOperationException();
                });
            }
            void start(Match match,Audit audit) {
                this.audit=audit;
                try {
                    Object next=callback(state->{synchronized(monitor) {
                        if(closed)return;
                        audit.event();
                        try {
                            boolean matches=match.test(state);
                            // An initial replay is not evidence of the requested edit.
                            if(Boolean.TRUE.equals(audit.get("sent")))matched=matches;
                        } catch(Exception | LinkageError error){failed=true;audit.put("readbackError","schema");}
                        monitor.notifyAll();
                    }});
                    Object error=callback(ignored->{synchronized(monitor){if(!closed){failed=true;audit.put("readbackError","stream");monitor.notifyAll();}}});
                    disposable=subscribe.invoke(stream,next,error);
                    synchronized(monitor){if(disposable==null||failed)throw new IllegalStateException();}
                    audit.put("observerStartedBeforeDispatch",true);
                } catch(Exception | LinkageError error){close();throw ShuffleEngine.error("OBSERVER_READY");}
            }
            void confirm() {
                synchronized(monitor) {
                    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5L);
                    while(!matched&&!failed) {
                        long remaining=deadline-System.nanoTime();if(remaining<=0)break;
                        try {TimeUnit.NANOSECONDS.timedWait(monitor,remaining);}
                        catch(InterruptedException error){Thread.currentThread().interrupt();throw ShuffleEngine.error("UNCONFIRMED_READBACK");}
                    }
                    if(matched&&!failed)return;
                    if(failed||((Number)audit.get("postDispatchEvents")).intValue()==0)throw ShuffleEngine.error("UNCONFIRMED_READBACK");
                    if(Boolean.TRUE.equals(audit.get("queueUnchanged")))throw ShuffleEngine.error("UNCONFIRMED_NO_CHANGE");
                    throw ShuffleEngine.error("UNCONFIRMED_ORDER");
                }
            }
            void close() {
                Object value;synchronized(monitor){closed=true;value=disposable;disposable=null;}
                if(value==null)return;
                try {type("io.reactivex.rxjava3.disposables.Disposable").getMethod("dispose").invoke(value);if(audit!=null)audit.put("observerDisposed",true);}
                catch(Exception | LinkageError error){if(audit!=null)audit.put("observerDisposed",false);}
            }
        }

        private Class<?> type(String name) throws Exception{return Class.forName(name,true,loader);}
        private Object await(Object single) throws Exception {return await(single,15L);}
        private Object await(Object single,long seconds) throws Exception {
            Class<?> type=type("io.reactivex.rxjava3.core.Single");
            Object limited=type.getMethod("timeout",long.class,TimeUnit.class).invoke(single,seconds,TimeUnit.SECONDS);
            return type.getMethod("blockingGet").invoke(limited);
        }
        private static Object call(Object target,String method) throws Exception {
            Method m=target.getClass().getMethod(method);m.setAccessible(true);return m.invoke(target);
        }
        private static Object uniqueField(Object owner,Class<?> wanted) throws Exception {
            Object result=wanted.isInstance(owner)?owner:null;
            for(Class<?> t=owner.getClass();t!=null;t=t.getSuperclass()) for(Field field:t.getDeclaredFields()) {
                if(Modifier.isStatic(field.getModifiers()) || !wanted.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);Object value=field.get(owner);
                if(value!=null){if(result!=null && result!=value)throw new IllegalStateException();result=value;}
            }
            if(result==null) throw new IllegalStateException();return result;
        }
        private static String label(Object value,String fallback,int limit) {
            String s=value instanceof String?(String)value:fallback;return s.substring(0,Math.min(s.length(),limit));
        }
        private static IllegalStateException controlled(Throwable error,String fallback) {
            if(error instanceof IllegalStateException && error.getMessage()!=null && error.getMessage().matches("SP_SHUFFLE_[A-Z_]+")) return (IllegalStateException)error;
            return ShuffleEngine.error(fallback);
        }
        private static final class Play {
            final Object client,request;final Method rpc;
            final Watch watch;final List<String> uris;
            Play(Object c,Method r,Object q,Watch watch,List<String> uris){client=c;rpc=r;request=q;this.watch=watch;this.uris=uris;}
        }
    }
}
