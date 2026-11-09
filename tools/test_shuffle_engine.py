"""Execute production engine and native PlayCommand adapter with renamed JVM fixtures."""
import pathlib,subprocess,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
HARNESS=r'''import java.util.*; import com.lenerd46.spotifyplus.api2.*;
public class Harness {
 static String uri(int n){return "spotify:track:"+String.format("%022d",n);}
 static void ok(boolean b){if(!b)throw new AssertionError();}
 static void fails(Runnable task,String code){try{task.run();throw new AssertionError("expected "+code);}catch(IllegalStateException e){ok(e.getMessage().equals("SP_SHUFFLE_"+code));}}
 static class Backend implements ShuffleEngine.Backend {
  final Object owner=new Object(),first=new Object(),second=new Object(),third=new Object(),old=new Object(),end=new Object();
  int reads,writes,prepares;String error;
  List<ShuffleEngine.Item> ordered; List<String> playUris;
  ShuffleEngine.Snapshot state=state("r","snapshot",false);
  ShuffleEngine.Snapshot state(String rev,String fp,boolean shuffle){return new ShuffleEngine.Snapshot(owner,rev,fp,shuffle,
    List.of(new ShuffleEngine.Item(uri(1),"A","",first),new ShuffleEngine.Item(uri(1),"A","",second),new ShuffleEngine.Item(uri(2),"B","",third)),List.of(old),end);}
  public ShuffleEngine.Snapshot read(){reads++;return state;}
  public Object preparePlay(ShuffleEngine.Snapshot s,String c,List<String> uris){prepares++;playUris=uris;return "prepared";}
  public void play(Object p){ok(p.equals("prepared"));writes++;if(error!=null)throw ShuffleEngine.error(error);}
  public void replace(ShuffleEngine.Snapshot s,List<ShuffleEngine.Item> tracks){ok(s.previous.get(0)==old&&s.delimiter==end);ordered=tracks;writes++;if(error!=null)throw ShuffleEngine.error(error);}
 }
 public static void main(String[] args)throws Exception {
  long[] now={0}; Backend b=new Backend();ShuffleEngine e=new ShuffleEngine(b,()->now[0]);
  ShuffleEngine.Plan q=e.queue();ok(b.writes==0&&q.tracks.size()==3);
  ok(e.apply(q.ticket,List.of(2,0,1))==3);ok(b.writes==1);ok(b.ordered.get(0).nativeTrack==b.third&&b.ordered.get(1).nativeTrack==b.first&&b.ordered.get(2).nativeTrack==b.second);
  final String once=q.ticket;fails(()->e.apply(once,List.of(0,1,2)),"USED");ok(b.writes==1);
  q=e.queue();final String duplicate=q.ticket;fails(()->e.apply(duplicate,List.of(0,0,2)),"INPUT");ok(b.writes==1);
  q=e.queue();final String stale=q.ticket;b.state=b.state("r2","order changed",false);fails(()->e.apply(stale,List.of(0,1,2)),"STALE_ORDER");ok(b.writes==1);
  q=e.queue();final String advanced=q.ticket;b.state=b.state("r2","different current or flags",false);fails(()->e.apply(advanced,List.of(0,1,2)),"STALE_ORDER");ok(b.writes==1);
  q=e.queue();final String toggled=q.ticket;b.state=b.state("r2","different current or flags",true);fails(()->e.apply(toggled,List.of(0,1,2)),"STALE_OPTIONS");fails(()->e.queue(),"SHUFFLE_ON");b.state=b.state("r3","new",false);
  q=e.queue();final String expired=q.ticket;now[0]=120001;fails(()->e.apply(expired,List.of(0,1,2)),"EXPIRED");
  q=e.queue();final String evicted=q.ticket;e.queue();e.queue();fails(()->e.apply(evicted,List.of(0,1,2)),"EXPIRED");
  List<String> input=new ArrayList<>(List.of(uri(2),uri(1),uri(1)));
  ShuffleEngine.Plan p=e.collection("spotify:collection:tracks",input);input.clear();ok(b.prepares==1&&b.playUris.size()==3&&b.writes==1);
  ok(e.apply(p.ticket,List.of(0,1,2))==3&&b.writes==2);
  p=e.collection("spotify:collection:tracks",List.of(uri(1)));b.error="RPC";final String uncertain=p.ticket;
  fails(()->e.apply(uncertain,List.of(0)),"RPC");fails(()->e.apply(uncertain,List.of(0)),"USED");ok(b.writes==3);b.error=null;
  fails(()->e.collection("https://invalid",List.of(uri(1))),"INPUT");
  fails(()->e.collection("spotify:collection:tracks",List.of("episode")),"UNSUPPORTED_ITEM");
  fails(()->e.collection("spotify:collection:tracks",List.of()),"LIMIT");
  fails(()->e.collection("spotify:collection:tracks",Collections.nCopies(10001,uri(1))),"LIMIT");
  p=e.collection("spotify:collection:tracks",Collections.nCopies(10000,uri(1)));ok(p.tracks.size()==10000&&b.writes==3);
  Backend fresh=new Backend();ShuffleEngine f=new ShuffleEngine(fresh,()->0);ShuffleEngine.Plan stable=f.queue();fresh.state=fresh.state("metadata-only-revision","snapshot",false);Object hydrated=new Object();fresh.state=new ShuffleEngine.Snapshot(fresh.owner,"metadata-only-revision","snapshot",false,List.of(new ShuffleEngine.Item(uri(1),"hydrated","",hydrated),new ShuffleEngine.Item(uri(1),"A","",fresh.second),new ShuffleEngine.Item(uri(2),"B","",fresh.third)),List.of(fresh.old),fresh.end);ok(f.apply(stable.ticket,List.of(2,0,1))==3&&fresh.writes==1&&fresh.ordered.get(1).nativeTrack==hydrated);
  stable=f.collection("spotify:collection:tracks",List.of(uri(1)));fresh.state=fresh.state("another-revision","snapshot",false);ok(f.apply(stable.ticket,List.of(0))==1&&fresh.writes==2);
  System.out.println("PASS engine stale/single-use/occurrence/history/bounds checks");
 }
}'''
FIXTURES={
'android/os/SystemClock.java': r'''package android.os; public class SystemClock {public static long elapsedRealtime(){return 0;}}''',
'com/lenerd/spotifyplus/module/Utils.java': r'''package com.lenerd.spotifyplus.module;public class Utils {public static Object playerState;}''',
'com/lenerd46/spotifyplus/player/NextUpQueue.java': r'''package com.lenerd46.spotifyplus.player;public class NextUpQueue {public static Object repo;public static Object currentRepository(){return repo;}}''',
'org/json/JSONException.java': r'''package org.json;public class JSONException extends RuntimeException {}''',
'org/json/JSONObject.java': r'''package org.json;public class JSONObject {final java.util.Map<String,Object> data=new java.util.HashMap<>();public JSONObject put(String k,Object v){data.put(k,v);return this;}public Object get(String k){if(!data.containsKey(k))throw new JSONException();return data.get(k);}public String getString(String k){Object v=get(k);if(!(v instanceof String))throw new JSONException();return (String)v;}public JSONArray getJSONArray(String k){return (JSONArray)get(k);}public int getInt(String k){return ((Number)get(k)).intValue();}}''',
'org/json/JSONArray.java': r'''package org.json;public class JSONArray {final java.util.List<Object> data=new java.util.ArrayList<>();public JSONArray put(Object v){data.add(v);return this;}public int length(){return data.size();}public Object get(int i){return data.get(i);}public String getString(int i){Object v=get(i);if(!(v instanceof String))throw new JSONException();return (String)v;}}''',
'io/reactivex/rxjava3/core/Single.java': r'''package io.reactivex.rxjava3.core;public class Single {final java.util.function.Supplier<Object> value;public static boolean lost;public Single(Object value){this.value=()->value;}public Single(java.util.function.Supplier<Object> value){this.value=value;}public Single timeout(long n,java.util.concurrent.TimeUnit unit){if(n<=0||unit.toNanos(n)>java.util.concurrent.TimeUnit.SECONDS.toNanos(15L))throw new AssertionError();return this;}public Object blockingGet(){if(lost)throw new IllegalStateException("private error");return value.get();}}''',
'io/reactivex/rxjava3/core/Flowable.java': r'''package io.reactivex.rxjava3.core;
import java.util.*;import java.util.concurrent.CopyOnWriteArrayList;import io.reactivex.rxjava3.functions.Consumer;import io.reactivex.rxjava3.disposables.Disposable;
public class Flowable {public Object value,nextInitial;public boolean failSubscribe,asyncInitial,silentInitial,changeInitial;public int subscriptions;public final List<Consumer> listeners=new CopyOnWriteArrayList<>();
public Flowable(Object value){this.value=value;}public Single firstOrError(){return new Single(()->value);}
public Disposable subscribe(Consumer next,Consumer error){subscriptions++;if(nextInitial!=null){value=nextInitial;nextInitial=null;}final java.util.concurrent.atomic.AtomicBoolean disposed=new java.util.concurrent.atomic.AtomicBoolean();
 Runnable initial=()->{if(disposed.get())return;listeners.add(next);try{if(failSubscribe)error.accept(new IllegalStateException("private"));else if(!silentInitial)next.accept(value);}catch(Exception e){try{error.accept(e);}catch(Exception ignored){}}};
 if(asyncInitial){Thread thread=new Thread(()->{try{Thread.sleep(75);}catch(InterruptedException e){return;}initial.run();});thread.setDaemon(true);thread.start();}else initial.run();
 return new Disposable(){public void dispose(){disposed.set(true);listeners.remove(next);}public boolean isDisposed(){return disposed.get();}};}
public void emit(Object value,boolean remember){if(remember)this.value=value;for(Consumer next:listeners)try{next.accept(value);}catch(Exception e){throw new IllegalStateException(e);}}
}''',
'io/reactivex/rxjava3/functions/Predicate.java': r'''package io.reactivex.rxjava3.functions;public interface Predicate {boolean test(Object value)throws Exception;}''',
'com/spotify/player/model/command/SetQueueCommand.java': r'''package com.spotify.player.model.command;
import java.util.*;import com.spotify.player.model.command.options.CommandOptions;
public class SetQueueCommand {public String revision;public List<?> next,previous;public CommandOptions options;
public static Builder builder(String rev,List<?> next,List<?> prev){Builder b=new Builder();b.v.revision=rev;b.v.next=next;b.v.previous=prev;return b;}
public static SetQueueCommand create(String rev,List<?> next,List<?> prev){return builder(rev,next,prev).build();}
public static class Builder {final SetQueueCommand v=new SetQueueCommand();public Builder options(CommandOptions options){v.options=options;return this;}public SetQueueCommand build(){return v;}}}''',
'com/lenerd/spotifyplus/module/hooks/PlayerHook.java': r'''package com.lenerd.spotifyplus.module.hooks;public class PlayerHook {public static Object contextPlayer;public static String playBinding="installed";}''',
'com/spotify/player/model/ContextTrack.java': r'''package com.spotify.player.model;import java.util.*;
public class ContextTrack {public String uri,uid="",provider="";public Map<String,String> meta=new HashMap<>();
public String uri(){return uri;}public String uid(){return uid;}public String provider(){return provider;}public Map<String,String> metadata(){return meta;}
public static Builder builder(String uri){Builder b=new Builder();b.v.uri=uri;return b;}public Builder toBuilder(){Builder b=builder(uri);b.v.uid=uid;b.v.provider=provider;b.v.meta.putAll(meta);return b;}
public static class Builder {final ContextTrack v=new ContextTrack();public Builder uid(String uid){v.uid=uid;return this;}public Builder provider(String p){v.provider=p;return this;}public Builder metadata(Map<String,String> m){v.meta=new HashMap<>(m);return this;}public ContextTrack build(){return v;}}}''',
'com/spotify/player/model/ContextPage.java': r'''package com.spotify.player.model;public class ContextPage {public java.util.List<ContextTrack> tracks;public static Builder builder(){return new Builder();}public static class Builder {final ContextPage v=new ContextPage();public Builder tracks(java.util.List<ContextTrack> tracks){v.tracks=tracks;return this;}public ContextPage build(){return v;}}}''',
'com/spotify/player/model/Context.java': r'''package com.spotify.player.model;public class Context {public String uri;public java.util.List<ContextPage> pages;public static Builder builder(String uri){Builder b=new Builder();b.v.uri=uri;return b;}public static class Builder {final Context v=new Context();public Builder pages(java.util.List<ContextPage> pages){v.pages=pages;return this;}public Context build(){return v;}}}''',
'com/spotify/player/model/PlayOrigin.java': r'''package com.spotify.player.model;public class PlayOrigin {public String feature,view;public static Builder builder(String feature){Builder b=new Builder();b.v.feature=feature;return b;}public static class Builder {final PlayOrigin v=new PlayOrigin();public Builder viewUri(String view){v.view=view;return this;}public PlayOrigin build(){return v;}}}''',
'com/spotify/player/model/command/options/SkipToTrack.java': r'''package com.spotify.player.model.command.options;public class SkipToTrack {public Long track,page;public static SkipToTrack fromIndices(Long track,Long page){SkipToTrack v=new SkipToTrack();v.track=track;v.page=page;return v;}}''',
'com/spotify/player/model/command/options/PlayerOptionOverrides.java': r'''package com.spotify.player.model.command.options;public class PlayerOptionOverrides {public Boolean shuffled,repeatTrack,repeatContext;public static Builder builder(){return new Builder();}public static class Builder {final PlayerOptionOverrides v=new PlayerOptionOverrides();public Builder shufflingContext(Boolean shuffled){v.shuffled=shuffled;return this;}public Builder repeatingTrack(Boolean x){v.repeatTrack=x;return this;}public Builder repeatingContext(Boolean x){v.repeatContext=x;return this;}public PlayerOptionOverrides build(){return v;}}}''',
'com/spotify/player/model/command/options/PreparePlayOptions.java': r'''package com.spotify.player.model.command.options;public class PreparePlayOptions {public Boolean always,paused;public SkipToTrack skip;public PlayerOptionOverrides overrides;public static Builder builder(){return new Builder();}public static class Builder {final PreparePlayOptions v=new PreparePlayOptions();public Builder alwaysPlaySomething(boolean always){v.always=always;return this;}public Builder initiallyPaused(boolean paused){v.paused=paused;return this;}public Builder skipTo(SkipToTrack skip){v.skip=skip;return this;}public Builder playerOptionsOverride(PlayerOptionOverrides overrides){v.overrides=overrides;return this;}public PreparePlayOptions build(){return v;}}}''',
'com/spotify/player/model/command/PlayCommand.java': r'''package com.spotify.player.model.command;public class PlayCommand {public com.spotify.player.model.Context context;public com.spotify.player.model.PlayOrigin origin;public com.spotify.player.model.command.options.PreparePlayOptions options;public static Builder builder(com.spotify.player.model.Context context,com.spotify.player.model.PlayOrigin origin){Builder b=new Builder();b.v.context=context;b.v.origin=origin;return b;}public static class Builder {final PlayCommand v=new PlayCommand();public Builder options(com.spotify.player.model.command.options.PreparePlayOptions options){v.options=options;return this;}public PlayCommand build(){return v;}}}''',
'io/reactivex/rxjava3/disposables/Disposable.java': r'''package io.reactivex.rxjava3.disposables;public interface Disposable {void dispose();boolean isDisposed();}''',
'io/reactivex/rxjava3/functions/Consumer.java': r'''package io.reactivex.rxjava3.functions;public interface Consumer {void accept(Object value)throws Exception;}''',
'com/spotify/player/model/command/options/CommandOptions.java': r'''package com.spotify.player.model.command.options;public class CommandOptions {public boolean override;public static Builder builder(){return new Builder();}public static class Builder {final CommandOptions v=new CommandOptions();public Builder overrideRestrictions(boolean value){v.override=value;return this;}public CommandOptions build(){return v;}}}''',
'com/lenerd46/spotifyplus/api2/ShuffleDiagnosticsUi.java': r'''package com.lenerd46.spotifyplus.api2;public class ShuffleDiagnosticsUi {public static String copied;public static boolean copy(String report){copied=report;return true;}}''',
'AdapterHarness.java': r'''import org.json.*;import java.util.*;import com.lenerd46.spotifyplus.api2.*;import com.spotify.player.model.*;import com.spotify.player.model.command.*;import io.reactivex.rxjava3.core.*;
public class AdapterHarness {
 static void ok(boolean b){if(!b)throw new AssertionError();}
 static String uri(int n){return "spotify:track:"+String.format("%022d",n);}
 static ContextTrack track(int n,String uid,String provider,boolean queued){return ContextTrack.builder(uri(n)).uid(uid).provider(provider).metadata(Map.of("is_queued",Boolean.toString(queued))).build();}
 public static class Opt {final ContextTrack value;Opt(ContextTrack t){value=t;}public boolean c(){return value!=null;}public ContextTrack b(){return value;}}
 public static class State {String rev="r";List<ContextTrack> next=List.of(AdapterHarness.track(1,"a","context",false),AdapterHarness.track(1,"b","context",false),AdapterHarness.track(2,"c","context",false)),prev=List.of(AdapterHarness.track(3,"old","context",false));Opt current=new Opt(AdapterHarness.track(3,"current","context",false));public Opt track(){return current;}public String revision(){return rev;}public List<ContextTrack> nextTracks(){return next;}public List<ContextTrack> prevTracks(){return prev;}}
 public static class Options {public boolean shuffled;public boolean shufflingContext(){return shuffled;}}
 public static class PlayerState {final Options options=new Options();public Options options(){return options;}}
 static Repo repo;static Handler handler;static PlayerState player;
 public static class Repo {final Flowable stream;int writes;SetQueueCommand last;boolean rejected,noOp,silentNoOp,changeCurrent,lose,stopAfterWrite,failSecondSubscribe;Repo(State s){stream=new Flowable(s);}
 public Single renamedDispatch(SetQueueCommand c){return new Single(()->{writes++;last=c;ok(c.options.override&&!stream.listeners.isEmpty());
 if(!c.revision.equals(((State)stream.value).rev))return "Failure{stale revision}";
 if(silentNoOp)return "Success{}";State original=(State)stream.value;State s=new State();s.current=original.current;s.prev=original.prev;s.rev=original.rev+"queue";s.next=original.next;
 if(!rejected&&!noOp){s.next=new ArrayList<>();int i=0;for(Object o:c.next){ContextTrack t=(ContextTrack)o;ContextTrack v=t.toBuilder().uid(t.uid.isEmpty()?"assigned-"+(i++):t.uid).build();s.next.add(v);}}
 if(changeCurrent)s.current=new Opt(track(8,"user-skip","context",false));stream.emit(s,true);
 if(stopAfterWrite){s=new State();s.current=new Opt(null);s.next=List.of();stream.emit(s,true);}
 if(lose)throw new IllegalStateException("private");return rejected?"Failure{}":"Success{}";});}}
 // Reproduces the R19 failure shape: starting playback accepts only the first
 // requested song; it does NOT conveniently install the entire shuffled page.
 public static class Handler {int writes;PlayCommand last;boolean noOp,lose,stop,contextTail,manualTail,failRead,failSecondSubscribe,deferSecond,silentSecond,changeSecond,metadataSecond;String status="Success{}";
 public Single obfuscatedPlay(PlayCommand c){return new Single(()->{writes++;last=c;ok(!repo.stream.listeners.isEmpty());
 if(status.startsWith("Success")&&!noOp){State s=new State();s.rev="play-"+writes;s.current=new Opt(track(Integer.parseInt(c.context.pages.get(0).tracks.get(0).uri.substring(14)),"core-"+writes,"context",false));
 s.next=List.of(track(8,"tail8",contextTail?"context":manualTail?"queue":"autoplay",manualTail),track(9,"tail9","autoplay",false));repo.stream.emit(s,true);
 if(stop){s=new State();s.current=new Opt(null);s.next=List.of();repo.stream.emit(s,true);}
 if(deferSecond)repo.stream.asyncInitial=true;
 if(silentSecond)repo.stream.silentInitial=true;
 if(metadataSecond)repo.stream.nextInitial=enriched((State)repo.stream.value);
 if(changeSecond){State changed=new State();changed.current=((State)repo.stream.value).current;changed.next=List.of(track(8,"manual-user-change","queue",true));repo.stream.nextInitial=changed;}
if(failSecondSubscribe)repo.stream.failSubscribe=true;if(failRead)Single.lost=true;}
 if(lose)throw new IllegalStateException("private");return status;});}}
 static State enriched(State original){State live=new State();live.rev=original.rev+"-metadata";live.current=original.current;
 live.prev=original.prev.stream().map(t->t.toBuilder().metadata(Map.of("is_queued",t.meta.get("is_queued"),"title","new-history")).build()).toList();
 live.next=original.next.stream().map(t->t.toBuilder().metadata(Map.of("is_queued",t.meta.get("is_queued"),"title","new-title")).build()).toList();return live;}
 static void reset(){Single.lost=false;State s=new State();repo=new Repo(s);handler=new Handler();player=new PlayerState();com.lenerd46.spotifyplus.player.NextUpQueue.repo=repo;com.lenerd.spotifyplus.module.Utils.playerState=player;com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=handler;}
 static Object call(String op,JSONObject args)throws Exception{return ShufflePlusBridge.execute(AdapterHarness.class.getClassLoader(),"shuffleplus."+op,args);}
 static JSONObject source(int... values){JSONArray a=new JSONArray();for(int n:values)a.put(uri(n));return new JSONObject().put("context","spotify:album:0000000000000000000099").put("uris",a);}
 static JSONObject prepare(int... values)throws Exception{return (JSONObject)call("prepare",source(values));}
 static JSONObject order(JSONObject p,int... values){JSONArray a=new JSONArray();for(int i:values)a.put(i);return new JSONObject().put("ticket",p.getString("ticket")).put("order",a);}
 static JSONObject apply(JSONObject p,int... values)throws Exception{return (JSONObject)call("apply",order(p,values));}
 static void fail(String op,JSONObject args,String code)throws Exception{try{call(op,args);throw new AssertionError("missing "+code);}catch(IllegalStateException e){if(!e.getMessage().equals("SP_SHUFFLE_"+code))throw new AssertionError("expected "+code+" got "+e.getMessage());}}
 static JSONObject diag()throws Exception{return (JSONObject)call("diagnostics",new JSONObject());}
 static void stopped(){ok(repo.stream.listeners.isEmpty());}
 public static void main(String[] args)throws Exception {
 reset();ok(((JSONObject)call("capabilities",new JSONObject())).getInt("host")==23);
 JSONObject p=(JSONObject)call("queue",new JSONObject());ok(repo.writes==0);apply(p,2,0,1);ok(((ContextTrack)repo.last.next.get(0)).uid.equals("c"));stopped();
 p=(JSONObject)call("queue",new JSONObject());((State)repo.stream.value).rev="metadata-only";apply(p,1,2,0);ok(repo.last.revision.equals("metadata-only"));
 p=(JSONObject)call("queue",new JSONObject());((State)repo.stream.value).current=new Opt(track(3,"new-current","context",false));fail("apply",order(p,0,1,2),"STALE_ORDER");
 reset();p=prepare(2,1,1);ok(handler.writes==0&&repo.writes==0);JSONObject result=apply(p,0,1,2);
 ok(handler.writes==1&&repo.writes==1&&result.getInt("autoplayTailCount")==2&&result.get("selectionCompleteInWindow").equals(true));
 PlayCommand c=handler.last;ok(c.context.uri.equals(uri(2))&&c.context.pages.size()==1&&c.context.pages.get(0).tracks.size()==1&&c.context.pages.get(0).tracks.get(0).uid.isEmpty());
 ok(!c.options.paused&&!c.options.overrides.shuffled&&!c.options.overrides.repeatTrack&&!c.options.overrides.repeatContext&&c.options.skip.track==0L&&c.options.skip.page==0L&&c.origin.view.equals("spotify:album:0000000000000000000099"));
 State state=(State)repo.stream.value;ok(state.next.size()==4&&state.next.get(0).uri.equals(uri(1))&&state.next.get(1).uri.equals(uri(1))&&!state.next.get(0).uid.equals(state.next.get(1).uid));
 ok(repo.last.next.size()==4&&((ContextTrack)repo.last.next.get(0)).uid.isEmpty()&&((ContextTrack)repo.last.next.get(0)).provider.isEmpty()&&((ContextTrack)repo.last.next.get(0)).meta.get("is_queued").equals("true"));
 ok(state.next.get(2).uid.equals("tail8")&&state.next.get(2).provider.equals("autoplay"));
 ok(diag().get("playSent").equals(true)&&diag().get("queueSent").equals(true)&&diag().get("firstTrackConfirmed").equals(true)&&diag().get("stage").equals("complete"));stopped();fail("apply",order(p,0,1,2),"USED");
 // Queue-only edits also wait for an asynchronous subscription before dispatch.
 reset();repo.stream.asyncInitial=true;p=(JSONObject)call("queue",new JSONObject());apply(p,2,0,1);ok(repo.writes==1&&diag().get("queueInitialStateReceived").equals(true));stopped();
 reset();repo.stream.silentInitial=true;p=(JSONObject)call("queue",new JSONObject());fail("apply",order(p,2,0,1),"UNCONFIRMED_INITIAL_STATE");ok(repo.writes==0&&diag().get("sent").equals(false));stopped();
 // Metadata/revision refresh during observer startup must use live CAS and native objects.
 reset();p=(JSONObject)call("queue",new JSONObject());State live=enriched((State)repo.stream.value);repo.stream.nextInitial=live;
 apply(p,1,2,0);ok(repo.writes==1&&repo.last.revision.equals(live.rev));
 ok(((ContextTrack)repo.last.next.get(0)).uid.equals("b")&&((ContextTrack)repo.last.next.get(2)).uid.equals("a"));
 ok(((ContextTrack)repo.last.next.get(0)).meta.get("title").equals("new-title")&&repo.last.previous.get(0)==live.prev.get(0));stopped();
 reset();handler.metadataSecond=true;handler.deferSecond=true;p=prepare(2,1,1);apply(p,0,1,2);
 ok(repo.writes==1&&repo.last.revision.equals("play-1-metadata"));
 ok(((ContextTrack)repo.last.next.get(2)).meta.get("title").equals("new-title"));stopped();
 // Existing/manual additions cannot be silently discarded.
 ((State)repo.stream.value).next=List.of(track(8,"manual-existing","queue",true));fail("prepare",source(1,2),"MANUAL_QUEUE");
 reset();p=prepare(1,2);((State)repo.stream.value).next=List.of(track(8,"manual","queue",true));fail("apply",order(p,0,1),"STALE_ORDER");ok(handler.writes==0&&repo.writes==0);
 reset();handler.manualTail=true;p=prepare(1,2);fail("apply",order(p,0,1),"SEQUENCE_CHANGED");ok(handler.writes==1&&repo.writes==0&&diag().get("outcome").equals("unknown"));stopped();
 reset();handler.contextTail=true;p=prepare(1,2);fail("apply",order(p,0,1),"SEQUENCE_CHANGED");ok(repo.writes==0);stopped();
 // A single song needs no queue write. Autoplay remains unchanged.
 reset();p=prepare(2);apply(p,0);ok(handler.writes==1&&repo.writes==0);stopped();
 // A real asynchronous subscription is not ready merely because subscribe returned.
 reset();handler.deferSecond=true;p=prepare(2,1,1);apply(p,0,1,2);ok(handler.writes==1&&repo.writes==1&&diag().get("queueInitialStateReceived").equals(true));stopped();
 reset();repo.stream.asyncInitial=true;p=prepare(2,1,1);apply(p,0,1,2);ok(handler.writes==1&&repo.writes==1&&diag().get("firstInitialStateReceived").equals(true));stopped();
 reset();repo.stream.silentInitial=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_INITIAL_STATE");ok(handler.writes==0&&repo.writes==0&&diag().get("sent").equals(false)&&diag().get("outcome").equals("not_sent"));stopped();
 reset();handler.silentSecond=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_INITIAL_STATE");ok(handler.writes==1&&repo.writes==0&&diag().get("firstTrackConfirmed").equals(true)&&diag().get("queueSent").equals(false)&&diag().get("queueObserverEvents").equals(0)&&diag().get("readbackStep").equals("selected-initial")&&diag().get("initialStateTimedOut").equals(true)&&diag().get("outcome").equals("unknown"));stopped();
 reset();handler.deferSecond=true;handler.changeSecond=true;p=prepare(2,1);fail("apply",order(p,0,1),"SEQUENCE_CHANGED");ok(handler.writes==1&&repo.writes==0&&diag().get("queueInitialStateReceived").equals(true));stopped();
 // An exact-order initial replay still cannot confirm the second operation.
 reset();repo.silentNoOp=true;p=prepare(2,8,9);fail("apply",order(p,0,1,2),"UNCONFIRMED_READBACK");ok(repo.writes==1&&diag().get("postDispatchEvents").equals(1)&&diag().get("outcome").equals("unknown"));stopped();
 // Initial replay of stage two cannot prove its write; a no-op stays unknown.
 reset();repo.noOp=true;p=prepare(2,1,1);fail("apply",order(p,0,1,2),"UNCONFIRMED_ORDER");ok(repo.writes==1&&handler.writes==1&&diag().get("outcome").equals("unknown"));stopped();
 reset();repo.rejected=true;p=prepare(2,1);fail("apply",order(p,0,1),"SEQUENCE_REFUSED");ok(diag().get("outcome").equals("unknown"));stopped();
 reset();repo.changeCurrent=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_ORDER");stopped();
 reset();repo.stopAfterWrite=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_ORDER");stopped();
 reset();repo.lose=true;p=prepare(2,1);fail("apply",order(p,0,1),"RPC");fail("apply",order(p,0,1),"USED");ok(repo.writes==1&&handler.writes==1);stopped();
 reset();handler.noOp=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_READBACK");ok(repo.writes==0);stopped();
 reset();handler.stop=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_ORDER");ok(repo.writes==0);stopped();
 reset();handler.status="Failure{}";p=prepare(2,1);fail("apply",order(p,0,1),"PLAY_REFUSED");ok(repo.writes==0&&diag().get("outcome").equals("refused"));stopped();
 reset();handler.lose=true;p=prepare(2,1);fail("apply",order(p,0,1),"RPC");ok(repo.writes==0);stopped();
 reset();handler.failSecondSubscribe=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_READBACK");ok(repo.writes==0&&diag().get("outcome").equals("unknown"));stopped();
 reset();handler.failRead=true;p=prepare(2,1);fail("apply",order(p,0,1),"UNCONFIRMED_READBACK");Single.lost=false;ok(repo.writes==0&&diag().get("outcome").equals("unknown"));stopped();
 reset();repo.stream.failSubscribe=true;p=prepare(2,1);fail("apply",order(p,0,1),"OBSERVER_READY");ok(handler.writes==0&&repo.writes==0);stopped();
 reset();p=prepare(2,1);com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=new Handler();fail("apply",order(p,0,1),"STALE_PLAYER");ok(handler.writes==0);
 reset();List<String> max=Collections.nCopies(9999,uri(1));var prepared=NativeQueueCommand.prepareSelection(AdapterHarness.class.getClassLoader(),"42",max,List.of(),List.of(track(9,"keep","autoplay",false)),null);ok(prepared.next.size()==10000);
 System.out.println("PASS staged adapter: first-track only, explicit queue, duplicate occurrences, preserved Autoplay, safe manual/concurrent changes, no-op/refusal/lost-result and observer cleanup");
 }
}
''',
}
class ShuffleTests(unittest.TestCase):
 def test_engine_and_native_command(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);files={**FIXTURES,'Harness.java':HARNESS};files['com/lenerd46/spotifyplus/BuildConfig.java']='package com.lenerd46.spotifyplus; public class BuildConfig {public static final int SHUFFLE_HOST='+str(__import__('json').loads((ROOT/'build-versions.json').read_text())['host'])+';}'
   for name in ['ShuffleEngine','QueueIdentity','NativePlaybackCommand','NativeQueueCommand','CollectionOrder','ShufflePlusBridge']:
    files['com/lenerd46/spotifyplus/api2/'+name+'.java']=(ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2'/f'{name}.java').read_text()
   for name,body in files.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
   c=subprocess.run(['java','com.sun.tools.javac.Main','-d',str(root/'classes'),*[str(p) for p in root.rglob('*.java')]],capture_output=True,text=True)
   self.assertEqual(c.returncode,0,c.stderr)
   for name in ['Harness','AdapterHarness']:
    r=subprocess.run(['java','-cp',str(root/'classes'),name],capture_output=True,text=True)
    self.assertEqual(r.returncode,0,r.stdout+r.stderr)
if __name__=='__main__':unittest.main()
