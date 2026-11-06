package com.lenerd46.spotifyplus.api2;

import com.lenerd.spotifyplus.module.Utils;
import com.lenerd46.spotifyplus.player.NextUpQueue;
import org.json.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Async API-2 operations used only when a Shuffle+ page explicitly requests them. */
public final class ShufflePlusBridge {
    private static ShuffleEngine engine;
    private static ClassLoader engineLoader;
    private ShufflePlusBridge() {}
    public static synchronized Object execute(ClassLoader loader,String operation,JSONObject args) throws Exception {
        if(operation.equals("shuffleplus.capabilities")) return new JSONObject().put("version",1).put("host",13).put("limit",ShuffleEngine.LIMIT);
        if(engine==null || engineLoader!=loader) {
            engineLoader=loader;
            engine=new ShuffleEngine(new NativeBackend(loader),android.os.SystemClock::elapsedRealtime);
        }
        try {
            if(operation.equals("shuffleplus.apply")) {
                JSONArray input=args.getJSONArray("order");
                if(input.length()>ShuffleEngine.LIMIT) throw ShuffleEngine.error("LIMIT");
                List<Integer> order=new ArrayList<>();
                for(int i=0;i<input.length();i++) {
                    Object value=input.get(i);
                    if(!(value instanceof Number) || ((Number)value).doubleValue()!=((Number)value).intValue()) throw ShuffleEngine.error("INPUT");
                    order.add(((Number)value).intValue());
                }
                return new JSONObject().put("applied",engine.apply(args.getString("ticket"),order));
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
                Object state=await(reader.invoke(stream));
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
                // AutoValue PlayerQueue contains revision/current/previous/next, not playback position.
                if(state.getClass().getMethod("toString").getDeclaringClass()==Object.class) throw new IllegalStateException();
                String fingerprint=Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256")
                        .digest(state.toString().getBytes(StandardCharsets.UTF_8)));
                return new ShuffleEngine.Snapshot(repo,revision,fingerprint,shuffled,items,previous,delimiter);
            } catch(Exception | LinkageError error){throw controlled(error,"READY");}
        }
        public Object preparePlay(ShuffleEngine.Snapshot snapshot,String context,List<String> uris) {
            try {
                Object request=ShuffleProtocol.play(loader,context,uris);
                Class<?> response=ShuffleProtocol.response(loader), clientType=type("com.spotify.esperanto.esperanto.ClientBase");
                Object client=uniqueField(snapshot.owner,clientType);
                Method rpc=null;
                for(Method method:clientType.getMethods()) {
                    Class<?>[] p=method.getParameterTypes();
                    if(method.getName().equals("callSingle") && !method.isBridge() && p.length==3 && p[0]==String.class && p[1]==String.class && p[2].isInstance(request)) {
                        if(rpc!=null) throw new IllegalStateException();rpc=method;
                    }
                }
                if(rpc==null) throw new NoSuchMethodException();
                // Resolve Rx methods before dispatch, including on a cold extension start.
                type("io.reactivex.rxjava3.core.Single").getMethod("timeout",long.class,TimeUnit.class);
                type("io.reactivex.rxjava3.core.Single").getMethod("blockingGet");
                return new Play(client,rpc,request,response);
            } catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
        }
        public void play(Object value) {
            Play p=(Play)value;byte[] response;
            try {response=(byte[])await(p.rpc.invoke(p.client,"spotify.player.esperanto.proto.ContextPlayer","Play",p.request));}
            catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
            int code;
            try {code=ShuffleProtocol.result(p.response,response);}
            catch(Exception | LinkageError error){throw ShuffleEngine.error("ACK");}
            if(code==1) throw ShuffleEngine.error("FORBIDDEN");
            if(code==2) throw ShuffleEngine.error("NOT_FOUND");
            if(code==3) throw ShuffleEngine.error("CONFLICT");
            if(code!=0) throw ShuffleEngine.error("ACK");
        }
        public void replace(ShuffleEngine.Snapshot snapshot,List<ShuffleEngine.Item> order) {
            Method dispatch;Object command;
            try {
                Class<?> type=type("com.spotify.player.model.command.SetQueueCommand");
                Method factory=type.getMethod("create",String.class,List.class,List.class);
                List<Object> tracks=new ArrayList<>();for(ShuffleEngine.Item item:order) tracks.add(item.nativeTrack);
                if(snapshot.delimiter!=null) tracks.add(snapshot.delimiter);
                command=factory.invoke(null,snapshot.revision,tracks,snapshot.previous);
                dispatch=null;
                for(Method m:snapshot.owner.getClass().getMethods())
                    if(!Modifier.isStatic(m.getModifiers()) && !m.isBridge() && Arrays.equals(m.getParameterTypes(),new Class<?>[]{type}) &&
                            type("io.reactivex.rxjava3.core.Single").isAssignableFrom(m.getReturnType())) {
                        if(dispatch!=null) throw new IllegalStateException();dispatch=m;
                    }
                if(dispatch==null) throw new NoSuchMethodException();dispatch.setAccessible(true);
            }catch(Exception | LinkageError error){throw controlled(error,"PREPARE");}
            Object result;
            try {result=await(dispatch.invoke(snapshot.owner,command));}
            catch(Exception | LinkageError error){throw ShuffleEngine.error("RPC");}
            String status=String.valueOf(result);
            if(status.startsWith("Failure{")) throw ShuffleEngine.error("CONFLICT");
            if(!status.startsWith("Success")) throw ShuffleEngine.error("ACK");
        }
        private Class<?> type(String name) throws Exception{return Class.forName(name,true,loader);}
        private Object await(Object single) throws Exception {
            Class<?> type=type("io.reactivex.rxjava3.core.Single");
            Object limited=type.getMethod("timeout",long.class,TimeUnit.class).invoke(single,15L,TimeUnit.SECONDS);
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
            final Object client,request;final Method rpc;final Class<?> response;
            Play(Object c,Method r,Object q,Class<?> response){client=c;rpc=r;request=q;this.response=response;}
        }
    }
}
