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
        if(operation.equals("shuffleplus.capabilities")) return new JSONObject().put("queueMode","native-editor-options").put("version",1).put("host",21).put("observerReadiness","await-initial-state").put("collectionVerification","provider-aware-autoplay").put("collectionMode","first-track-explicit-queue").put("route","native-play-and-setqueue").put("playerReady",PlayerHook.contextPlayer!=null).put("binding",PlayerHook.playBinding).put("limit",ShuffleEngine.LIMIT);
        if(engine==null || engineLoader!=loader) {
            engineLoader=loader;
            engine=new ShuffleEngine(new NativeBackend(loader),android.os.SystemClock::elapsedRealtime);
        }
        try {
            if(operation.equals("shuffleplus.apply")) {
                lastReport=Map.of("host",21,"outcome","not_sent");
                JSONArray input=args.getJSONArray("order");
                if(input.length()>ShuffleEngine.LIMIT) throw ShuffleEngine.error("LIMIT");
                List<Integer> order=new ArrayList<>();
                for(int i=0;i<input.length();i++) {
                    Object value=input.get(i);
                    if(!(value instanceof Number) || ((Number)value).doubleValue()!=((Number)value).intValue()) throw ShuffleEngine.error("INPUT");
                    order.add(((Number)value).intValue());
                }
                JSONObject result=new JSONObject().put("applied",engine.apply(args.getString("ticket"),order)).put("verification","visible-order");
                if("collection".equals(lastReport.get("mode")))result.put("autoplayTailCount",lastReport.get("autoplayTailCount")).put("selectionCompleteInWindow",lastReport.get("selectionCompleteInWindow"));
                return result;
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
        public ShuffleEngine.Snapshot read() {return read(5L);}
        private ShuffleEngine.Snapshot read(long seconds) {return read(seconds,TimeUnit.SECONDS);}
        private ShuffleEngine.Snapshot read(long timeout,TimeUnit unit) {
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
                Object state=await(reader.invoke(stream),timeout,unit);
                String revision=(String)call(state,"revision");
                if(revision==null || revision.isEmpty()) throw new IllegalStateException();
                List<?> next=(List<?>)call(state,"nextTracks"), previous=(List<?>)call(state,"prevTracks");
                if(next.size()>ShuffleEngine.LIMIT+1) throw ShuffleEngine.error("LIMIT");
                List<ShuffleEngine.Item> items=new ArrayList<>();Object delimiter=null;
                for(int i=0;i<next.size();i++) {
                    Object t=next.get(i);String uri=(String)call(t,"uri");
                    if(("spotify:delimiter".equals(uri)||"spotify:meta:delimiter".equals(uri)) && i==next.size()-1){delimiter=t;continue;}
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
                List<Object> existing=new ArrayList<>();for(var item:snapshot.next)existing.add(item.nativeTrack);
                NativeQueueCommand.requireNoManual(existing);
                // Resolve both dispatchers/builders before starting any audio.
                Method queueRpc=NativeQueueCommand.dispatcher(loader,snapshot.owner.getClass());
                if(uris.size()>1)NativeQueueCommand.prepareSelection(loader,snapshot.revision,uris.subList(1,uris.size()),snapshot.previous,List.of(),null);
                return new Play(target,dispatch,queueRpc,request,snapshot,List.copyOf(uris));
            } catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
        }
        public void play(Object value) {
            Play p=(Play)value;
            if(p.client!=PlayerHook.contextPlayer)throw ShuffleEngine.error("STALE_PLAYER");
            Audit audit=new Audit("collection");audit.put("expectedTrackCount",p.uris.size());audit.put("requestFormat","first-track-explicit-queue");
            Watch first=null,queue=null;Budget budget=new Budget();
            try {
                // Recheck the manual queue at apply time, not just preview time.
                ShuffleEngine.Snapshot before=read(budget.nanos(2L),TimeUnit.NANOSECONDS);
                if(before.owner!=p.owner)throw ShuffleEngine.error("STALE_OWNER");
                if(!before.fingerprint.equals(p.snapshot.fingerprint))throw ShuffleEngine.error("STALE_ORDER");
                if(before.shuffled!=p.snapshot.shuffled)throw ShuffleEngine.error("STALE_OPTIONS");
                List<Object> existing=new ArrayList<>();for(var item:before.next)existing.add(item.nativeTrack);
                NativeQueueCommand.requireNoManual(existing);
                audit.put("stage","first-track");audit.put("readbackStep","first-initial");first=watch(p.owner);
                first.start(state -> {
                    Object current=current(state);boolean matches=current!=null&&p.uris.get(0).equals(call(current,"uri"))&&!String.valueOf(call(current,"uid")).isEmpty();
                    audit.put("currentPresent",current!=null);audit.put("currentUriMatches",current!=null&&p.uris.get(0).equals(call(current,"uri")));
                    audit.put("currentUidAssigned",current!=null&&!String.valueOf(call(current,"uid")).isEmpty());return matches;
                },audit);
                Object initial=first.initial(budget.nanos(2L));
                if(!before.fingerprint.equals(QueueIdentity.fingerprint(initial)))throw ShuffleEngine.error("STALE_ORDER");
                long playTimeout=budget.nanos(5L);
                first.dispatching();audit.put("playSent",true);audit.put("outcome","unknown");
                Object result;
                try {result=await(p.rpc.invoke(p.client,p.request),playTimeout,TimeUnit.NANOSECONDS);}
                catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
                String status=String.valueOf(result);
                if(status.startsWith("Failure")){audit.put("playReply","refused");audit.put("outcome","refused");throw ShuffleEngine.error("PLAY_REFUSED");}
                if(!status.startsWith("Success"))throw ShuffleEngine.error("ACK");
                audit.put("playReply","success");audit.put("readbackStep","first-confirm");first.confirmNanos(budget.nanos(3L));
                Object firstState=first.latest();Object firstCurrent=current(firstState);
                audit.put("firstTrackConfirmed",true);first.close();
                ShuffleEngine.Snapshot fresh=read(budget.nanos(2L),TimeUnit.NANOSECONDS);
                Object freshCurrent=currentFromOptional(fresh.current);
                if(fresh.shuffled||freshCurrent==null||!p.uris.get(0).equals(call(freshCurrent,"uri"))||String.valueOf(call(freshCurrent,"uid")).isEmpty())throw ShuffleEngine.error("SEQUENCE_CHANGED");
                if(fresh.owner!=p.owner||p.client!=PlayerHook.contextPlayer||
                        !QueueIdentity.fingerprint(fresh.current,List.of(),List.of()).equals(QueueIdentity.fingerprint(call(firstState,"track"),List.of(),List.of())))
                    throw ShuffleEngine.error("SEQUENCE_CHANGED");
                List<Object> tail=new ArrayList<>();for(var item:fresh.next)tail.add(item.nativeTrack);
                NativeQueueCommand.requireAutoplayTail(tail);
                if(p.uris.size()==1) {
                    if(!assess(firstCurrent,tail,p.uris,audit))throw ShuffleEngine.error("UNCONFIRMED_ORDER");
                    audit.put("stage","complete");audit.put("readbackStep","complete");audit.put("outcome","confirmed");return;
                }
                NativeQueueCommand.Prepared prepared=NativeQueueCommand.prepareSelection(loader,fresh.revision,p.uris.subList(1,p.uris.size()),fresh.previous,tail,fresh.delimiter);
                audit.put("queuedRequestCount",p.uris.size()-1);audit.put("nativeEditorOptions",true);
                audit.put("stage","selected-queue");audit.put("readbackStep","selected-initial");queue=watch(p.owner);
                queue.start(state -> {
                    boolean currentMatches=QueueIdentity.fingerprint(fresh.current,List.of(),List.of()).equals(QueueIdentity.fingerprint(call(state,"track"),List.of(),List.of()));
                    boolean historyMatches=QueueIdentity.fingerprint(fresh.current,fresh.previous,List.of()).equals(QueueIdentity.fingerprint(fresh.current,(List<?>)call(state,"prevTracks"),List.of()));
                    audit.put("currentMatches",currentMatches);audit.put("historyMatches",historyMatches);
                    boolean matches=assess(current(state),(List<?>)call(state,"nextTracks"),p.uris,audit);
                    return currentMatches&&historyMatches&&matches;
                },audit);
                // Initial replay is not confirmation. Reject concurrent edits before dispatch.
                Object queueInitial=queue.initial(budget.nanos(2L));
                if(!fresh.fingerprint.equals(QueueIdentity.fingerprint(queueInitial)))throw ShuffleEngine.error("SEQUENCE_CHANGED");
                long queueTimeout=budget.nanos(5L);
                queue.dispatching();audit.put("queueSent",true);
                try {result=await(p.queueRpc.invoke(p.owner,prepared.command),queueTimeout,TimeUnit.NANOSECONDS);}
                catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
                status=String.valueOf(result);
                if(status.startsWith("Failure")){audit.put("queueReply","refused");throw ShuffleEngine.error("SEQUENCE_REFUSED");}
                if(!status.startsWith("Success"))throw ShuffleEngine.error("ACK");
                audit.put("queueReply","success");audit.put("readbackStep","selected-confirm");queue.confirmNanos(budget.nanos(3L));audit.put("readbackStep","complete");audit.put("stage","complete");audit.put("outcome","confirmed");
            } catch(IllegalStateException error){
                if(Boolean.TRUE.equals(audit.get("sent"))&&Set.of("SP_SHUFFLE_OBSERVER_READY","SP_SHUFFLE_READY","SP_SHUFFLE_PREPARE").contains(error.getMessage()))throw ShuffleEngine.error("UNCONFIRMED_READBACK");
                throw error;
            }
            catch(Exception | LinkageError error){throw controlled(error,"SEQUENCE_CHANGED");}
            finally {if(first!=null)first.close();if(queue!=null)queue.close();audit.publish();}
        }
        private static Object current(Object state) throws Exception {
            return currentFromOptional(call(state,"track"));
        }
        private static Object currentFromOptional(Object optional) throws Exception {
            return (Boolean)call(optional,"c")?call(optional,"b"):null;
        }
        private static boolean assess(Object current,List<?> next,List<String> uris,Audit audit) throws Exception {
            audit.put("observedNextCount",next.size());
            CollectionOrder.Assessment order=CollectionOrder.inspect(current,next,uris);
            audit.put("selectionPrefixMatches",order.prefixMatches);audit.put("selectionCompleteInWindow",order.selectionCompleteInWindow);
            audit.put("autoplayInSelectionCount",order.autoplayInSelectionCount);audit.put("expectedUpcomingCount",order.expectedUpcomingCount);audit.put("matchingUpcomingPrefixCount",order.matchingUpcomingPrefixCount);
            audit.put("autoplayTailCount",order.autoplayTailCount);audit.put("contextTailCount",order.contextTailCount);
            audit.put("queuedTailCount",order.queuedTailCount);audit.put("otherTailCount",order.otherTailCount);audit.put("delimiterTailCount",order.delimiterTailCount);
            audit.put("autoplayTailOnly",order.autoplayTailOnly);audit.put("visibleOrderMatches",order.matches);return order.matches;
        }
        public void replace(ShuffleEngine.Snapshot snapshot,List<ShuffleEngine.Item> order) {
            Method dispatch;Watch observer;NativeQueueCommand.Prepared prepared;String expected;int queuedSlots;
            try {
                List<Object> original=new ArrayList<>();for(ShuffleEngine.Item item:snapshot.next)original.add(item.nativeTrack);
                queuedSlots=NativeQueueCommand.queuedSlots(original);
                List<Object> tracks=new ArrayList<>();for(ShuffleEngine.Item item:order)tracks.add(item.nativeTrack);
                prepared=NativeQueueCommand.prepare(loader,snapshot.revision,tracks,snapshot.previous,queuedSlots,snapshot.delimiter);
                expected=QueueIdentity.fingerprint(snapshot.current,snapshot.previous,prepared.next);
                dispatch=NativeQueueCommand.dispatcher(loader,snapshot.owner.getClass());
                observer=watch(snapshot.owner);
            } catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
            Audit audit=new Audit("queue");audit.put("expectedNextCount",prepared.next.size());audit.put("queuedSlots",queuedSlots);
            audit.put("nativeEditorOptions",true);
            try {
                audit.put("readbackStep","queue-initial");observer.start(state -> {
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
                try {if(!snapshot.fingerprint.equals(QueueIdentity.fingerprint(observer.initial(TimeUnit.SECONDS.toNanos(2L)))))throw ShuffleEngine.error("STALE_ORDER");}
                catch(Exception | LinkageError error){throw controlled(error,"OBSERVER_READY");}
                observer.dispatching();audit.put("queueSent",true);audit.put("outcome","unknown");
                Object result;
                try {result=await(dispatch.invoke(snapshot.owner,prepared.command));}
                catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
                String status=String.valueOf(result);
                if(status.startsWith("Failure")){audit.put("reply","refused");audit.put("outcome","refused");throw ShuffleEngine.error("CONFLICT");}
                if(!status.startsWith("Success"))throw ShuffleEngine.error("ACK");
                audit.put("reply","success");audit.put("readbackStep","queue-confirm");observer.confirm();audit.put("outcome","confirmed");
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
        private interface Match {boolean test(Object state) throws Exception;}
        private static final class Audit {
            final Map<String,Object> values=new LinkedHashMap<>();
            Audit(String mode){put("host",21);put("mode",mode);put("sent",false);put("outcome","not_sent");put("eventsObserved",0);put("postDispatchEvents",0);if("collection".equals(mode)){put("playSent",false);put("queueSent",false);put("firstInitialStateReceived",false);put("queueInitialStateReceived",false);put("firstObserverEvents",0);put("queueObserverEvents",0);}}
            synchronized void put(String key,Object value){values.put(key,value);}
            synchronized Object get(String key){return values.get(key);}
            synchronized void event(boolean dispatched){if("collection".equals(values.get("mode"))){String key="selected-queue".equals(values.get("stage"))?"queueObserverEvents":"firstObserverEvents";values.put(key,((Number)values.get(key)).intValue()+1);}values.put("eventsObserved",((Number)values.get("eventsObserved")).intValue()+1);if(dispatched)values.put("postDispatchEvents",((Number)values.get("postDispatchEvents")).intValue()+1);}
            synchronized void publish(){lastReport=Collections.unmodifiableMap(new LinkedHashMap<>(values));}
        }
        private final class Watch {
            final Object stream;final Class<?> consumer;final Method subscribe;
            final Object monitor=new Object();boolean matched,failed,closed,dispatched;int postEvents;Object latest;
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
                        audit.event(dispatched);latest=state;if(dispatched)postEvents++;
                        try {
                            boolean matches=match.test(state);
                            // An initial replay is not evidence of the requested edit.
                            if(dispatched)matched=matches;
                        } catch(Exception | LinkageError error){failed=true;audit.put("readbackError","schema");}
                        monitor.notifyAll();
                    }});
                    Object error=callback(ignored->{synchronized(monitor){if(!closed){failed=true;audit.put("readbackError","stream");monitor.notifyAll();}}});
                    disposable=subscribe.invoke(stream,next,error);
                    synchronized(monitor){if(disposable==null||failed)throw new IllegalStateException();}
                    audit.put("observerStartedBeforeDispatch",true);
                } catch(Exception | LinkageError error){close();throw ShuffleEngine.error("OBSERVER_READY");}
            }
            void dispatching(){synchronized(monitor){if(failed||closed)throw ShuffleEngine.error("OBSERVER_READY");dispatched=true;audit.put("sent",true);}}
            Object initial(long timeoutNanos) {
                synchronized(monitor) {
                    long deadline=System.nanoTime()+timeoutNanos;
                    while(latest==null&&!failed&&!closed) {
                        long remaining=deadline-System.nanoTime();if(remaining<=0)break;
                        try {TimeUnit.NANOSECONDS.timedWait(monitor,remaining);}
                        catch(InterruptedException error){Thread.currentThread().interrupt();throw ShuffleEngine.error("UNCONFIRMED_READBACK");}
                    }
                    if(failed||closed)throw ShuffleEngine.error("UNCONFIRMED_READBACK");
                    if(latest==null){audit.put("initialStateTimedOut",true);throw ShuffleEngine.error("UNCONFIRMED_INITIAL_STATE");}
                    audit.put(!"collection".equals(audit.get("mode"))||"selected-queue".equals(audit.get("stage"))?"queueInitialStateReceived":"firstInitialStateReceived",true);
                    // Readiness does not mark the command as dispatched or matched.
                    return latest;
                }
            }
            Object latest(){synchronized(monitor){if(latest==null||failed)throw ShuffleEngine.error("UNCONFIRMED_READBACK");return latest;}}
            void confirm(){confirm(5L);}
            void confirm(long seconds) {confirmNanos(TimeUnit.SECONDS.toNanos(seconds));}
            void confirmNanos(long timeoutNanos) {
                synchronized(monitor) {
                    long deadline=System.nanoTime()+timeoutNanos;
                    while(!matched&&!failed&&!closed) {
                        long remaining=deadline-System.nanoTime();if(remaining<=0)break;
                        try {TimeUnit.NANOSECONDS.timedWait(monitor,remaining);}
                        catch(InterruptedException error){Thread.currentThread().interrupt();throw ShuffleEngine.error("UNCONFIRMED_READBACK");}
                    }
                    if(matched&&!failed&&!closed)return;
                    if(failed||closed||postEvents==0)throw ShuffleEngine.error("UNCONFIRMED_READBACK");
                    if(Boolean.TRUE.equals(audit.get("queueUnchanged")))throw ShuffleEngine.error("UNCONFIRMED_NO_CHANGE");
                    throw ShuffleEngine.error("UNCONFIRMED_ORDER");
                }
            }
            void close() {
                Object value;synchronized(monitor){closed=true;value=disposable;disposable=null;monitor.notifyAll();}
                if(value==null)return;
                try {type("io.reactivex.rxjava3.disposables.Disposable").getMethod("dispose").invoke(value);if(audit!=null)audit.put("observerDisposed",true);}
                catch(Exception | LinkageError error){if(audit!=null)audit.put("observerDisposed",false);}
            }
        }

        // The engine's freshness read can consume 5 seconds. Bound the entire
        // staged operation to another 22, leaving room in the host's 30s request.
        private static final class Budget {
            final long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(22L);
            long nanos(long capSeconds){long left=deadline-System.nanoTime();if(left<=0)throw ShuffleEngine.error("UNCONFIRMED_DEADLINE");return Math.min(left,TimeUnit.SECONDS.toNanos(capSeconds));}
        }
        private Class<?> type(String name) throws Exception{return Class.forName(name,true,loader);}
        private Object await(Object single) throws Exception {return await(single,15L);}
        private Object await(Object single,long seconds) throws Exception {return await(single,seconds,TimeUnit.SECONDS);}
        private Object await(Object single,long timeout,TimeUnit unit) throws Exception {
            Class<?> type=type("io.reactivex.rxjava3.core.Single");
            Object limited=type.getMethod("timeout",long.class,TimeUnit.class).invoke(single,timeout,unit);
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
            final Object client,request,owner;final Method rpc,queueRpc;final List<String> uris;final ShuffleEngine.Snapshot snapshot;
            Play(Object c,Method r,Method q,Object request,ShuffleEngine.Snapshot snapshot,List<String> uris){client=c;rpc=r;queueRpc=q;this.request=request;this.snapshot=snapshot;owner=snapshot.owner;this.uris=uris;}
        }
    }
}
