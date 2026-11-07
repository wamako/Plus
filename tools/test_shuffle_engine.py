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
  q=e.queue();final String stale=q.ticket;b.state=b.state("r2","snapshot",false);fails(()->e.apply(stale,List.of(0,1,2)),"STALE");ok(b.writes==1);
  q=e.queue();final String advanced=q.ticket;b.state=b.state("r2","different current or flags",false);fails(()->e.apply(advanced,List.of(0,1,2)),"STALE");ok(b.writes==1);
  q=e.queue();final String toggled=q.ticket;b.state=b.state("r2","different current or flags",true);fails(()->e.apply(toggled,List.of(0,1,2)),"STALE");fails(()->e.queue(),"SHUFFLE_ON");b.state=b.state("r3","new",false);
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
'io/reactivex/rxjava3/core/Single.java': r'''package io.reactivex.rxjava3.core;public class Single {final java.util.function.Supplier<Object> value;public static boolean lost;public Single(Object value){this.value=()->value;}public Single(java.util.function.Supplier<Object> value){this.value=value;}public Single timeout(long n,java.util.concurrent.TimeUnit unit){if(n!=15&&n!=5)throw new AssertionError();return this;}public Object blockingGet(){if(lost)throw new IllegalStateException("private error");return value.get();}}''',
'io/reactivex/rxjava3/core/Flowable.java': r'''package io.reactivex.rxjava3.core;public class Flowable {public Object value;public java.util.List<Object> later=new java.util.ArrayList<>();private Flowable source;private io.reactivex.rxjava3.functions.Predicate match;public Flowable(Object v){value=v;}public Flowable renamedFilter(io.reactivex.rxjava3.functions.Predicate p){Flowable f=new Flowable(null);f.source=this;f.match=p;return f;}public Single firstOrError(){return new Single(()->{if(source==null)return value;try{java.util.List<Object> events=new java.util.ArrayList<>();events.add(source.value);events.addAll(source.later);for(Object event:events)if(match.test(event))return event;throw new IllegalStateException("timeout");}catch(Exception e){throw new IllegalStateException(e);}});}}''',
'io/reactivex/rxjava3/functions/Predicate.java': r'''package io.reactivex.rxjava3.functions;public interface Predicate {boolean test(Object value)throws Exception;}''',
'com/spotify/player/model/command/SetQueueCommand.java': r'''package com.spotify.player.model.command;public class SetQueueCommand {public String revision;public java.util.List<?> next,previous;public static SetQueueCommand create(String rev,java.util.List<?> next,java.util.List<?> prev){SetQueueCommand c=new SetQueueCommand();c.revision=rev;c.next=next;c.previous=prev;return c;}}''',
'com/lenerd/spotifyplus/module/hooks/PlayerHook.java': r'''package com.lenerd.spotifyplus.module.hooks;public class PlayerHook {public static Object contextPlayer;public static String playBinding="installed";}''',
'com/spotify/player/model/ContextTrack.java': r'''package com.spotify.player.model;public class ContextTrack {public String uri,uid="";public static Builder builder(String uri){Builder b=new Builder();b.v.uri=uri;return b;}public static class Builder {final ContextTrack v=new ContextTrack();public Builder uid(String uid){v.uid=uid;return this;}public ContextTrack build(){return v;}}}''',
'com/spotify/player/model/ContextPage.java': r'''package com.spotify.player.model;public class ContextPage {public java.util.List<ContextTrack> tracks;public static Builder builder(){return new Builder();}public static class Builder {final ContextPage v=new ContextPage();public Builder tracks(java.util.List<ContextTrack> tracks){v.tracks=tracks;return this;}public ContextPage build(){return v;}}}''',
'com/spotify/player/model/Context.java': r'''package com.spotify.player.model;public class Context {public String uri;public java.util.List<ContextPage> pages;public static Builder builder(String uri){Builder b=new Builder();b.v.uri=uri;return b;}public static class Builder {final Context v=new Context();public Builder pages(java.util.List<ContextPage> pages){v.pages=pages;return this;}public Context build(){return v;}}}''',
'com/spotify/player/model/PlayOrigin.java': r'''package com.spotify.player.model;public class PlayOrigin {public String feature,view;public static Builder builder(String feature){Builder b=new Builder();b.v.feature=feature;return b;}public static class Builder {final PlayOrigin v=new PlayOrigin();public Builder viewUri(String view){v.view=view;return this;}public PlayOrigin build(){return v;}}}''',
'com/spotify/player/model/command/options/SkipToTrack.java': r'''package com.spotify.player.model.command.options;public class SkipToTrack {public Long track,page;public static SkipToTrack fromIndices(Long track,Long page){SkipToTrack v=new SkipToTrack();v.track=track;v.page=page;return v;}}''',
'com/spotify/player/model/command/options/PlayerOptionOverrides.java': r'''package com.spotify.player.model.command.options;public class PlayerOptionOverrides {public Boolean shuffled;public static Builder builder(){return new Builder();}public static class Builder {final PlayerOptionOverrides v=new PlayerOptionOverrides();public Builder shufflingContext(Boolean shuffled){v.shuffled=shuffled;return this;}public PlayerOptionOverrides build(){return v;}}}''',
'com/spotify/player/model/command/options/PreparePlayOptions.java': r'''package com.spotify.player.model.command.options;public class PreparePlayOptions {public boolean always;public SkipToTrack skip;public PlayerOptionOverrides overrides;public static Builder builder(){return new Builder();}public static class Builder {final PreparePlayOptions v=new PreparePlayOptions();public Builder alwaysPlaySomething(boolean always){v.always=always;return this;}public Builder skipTo(SkipToTrack skip){v.skip=skip;return this;}public Builder playerOptionsOverride(PlayerOptionOverrides overrides){v.overrides=overrides;return this;}public PreparePlayOptions build(){return v;}}}''',
'com/spotify/player/model/command/PlayCommand.java': r'''package com.spotify.player.model.command;public class PlayCommand {public com.spotify.player.model.Context context;public com.spotify.player.model.PlayOrigin origin;public com.spotify.player.model.command.options.PreparePlayOptions options;public static Builder builder(com.spotify.player.model.Context context,com.spotify.player.model.PlayOrigin origin){Builder b=new Builder();b.v.context=context;b.v.origin=origin;return b;}public static class Builder {final PlayCommand v=new PlayCommand();public Builder options(com.spotify.player.model.command.options.PreparePlayOptions options){v.options=options;return this;}public PlayCommand build(){return v;}}}''',
'AdapterHarness.java': r'''import org.json.*;import java.util.*;import com.lenerd46.spotifyplus.api2.*;import com.spotify.player.model.command.*;import io.reactivex.rxjava3.core.*;
public class AdapterHarness {
 static void ok(boolean b){if(!b)throw new AssertionError();}
 static String uri(int n){return "spotify:track:"+String.format("%022d",n);}
 public static class Track {final String uri,uid;Track(int n,String u){uri=AdapterHarness.uri(n);uid=u;}public String uri(){return uri;}public String uid(){return uid;}public Map<String,String> metadata(){return Map.of("title",uid);}public String toString(){return uri+uid;}}
 public static class Opt {final Track value;Opt(Track t){value=t;}public boolean c(){return value!=null;}public Track b(){return value;}public String toString(){return String.valueOf(value);}}
 public static class State {String rev="r";final Track a=new Track(1,"a"),b=new Track(1,"b"),c=new Track(2,"c"),old=new Track(3,"old");List<Track> next=List.of(a,b,c),prev=List.of(old);Opt current=new Opt(old);public Opt track(){return current;}public String revision(){return rev;}public List<Track> nextTracks(){return next;}public List<Track> prevTracks(){return prev;}public String toString(){return rev+next+prev+current;}}
 public static class Options {public boolean shuffled;public boolean shufflingContext(){return shuffled;}}
 public static class PlayerState {final Options options=new Options();public Options options(){return options;}}
 public static class Repo {final Flowable stream;int writes;SetQueueCommand last;boolean rejected,noOp;Repo(State s){stream=new Flowable(s);}public Single renamedDispatch(SetQueueCommand c){writes++;last=c;if(!rejected&&!noOp){State s=(State)stream.value;s.next=(List<Track>)c.next;s.rev+="queue";}return new Single(rejected?"Failure{}":"Success{}");}}
 // The pipeline fixture requires subscribing to its lazy result. A direct
 // Esperanto request cannot invoke it or run its interceptors.
 public static class Handler {final State state;int interceptors,writes;boolean noOp,loseAfterWrite;String status="Success{}";PlayCommand last;Handler(State s){state=s;}public Single obfuscatedPlay(PlayCommand c){return new Single(()->{interceptors++;writes++;last=c;if(status.startsWith("Success")&&!noOp){List<Track> ordered=new ArrayList<>();for(var t:c.context.pages.get(0).tracks)ordered.add(new Track(Integer.parseInt(t.uri.substring(t.uri.lastIndexOf(':')+1)),t.uid));state.current=new Opt(ordered.get(0));state.next=new ArrayList<>(ordered.subList(1,ordered.size()));state.rev+="play";}if(loseAfterWrite)throw new IllegalStateException("private error");return status;});}}
 static Object call(String operation,JSONObject args)throws Exception{return ShufflePlusBridge.execute(AdapterHarness.class.getClassLoader(),"shuffleplus."+operation,args);}
 static void fail(String operation,JSONObject args,String code)throws Exception{try{call(operation,args);throw new AssertionError("missing "+code);}catch(IllegalStateException e){ok(e.getMessage().equals("SP_SHUFFLE_"+code));}}
 static JSONObject order(String ticket,int... values){JSONArray a=new JSONArray();for(int i:values)a.put(i);return new JSONObject().put("ticket",ticket).put("order",a);}
 public static void main(String[] args)throws Exception{
  State state=new State();Repo repo=new Repo(state);PlayerState player=new PlayerState();Handler handler=new Handler(state);com.lenerd46.spotifyplus.player.NextUpQueue.repo=repo;com.lenerd.spotifyplus.module.Utils.playerState=player;com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=handler;
  ok(((JSONObject)call("capabilities",new JSONObject())).getInt("host")==15);
  JSONObject p=(JSONObject)call("queue",new JSONObject());ok(p.getInt("count")==3&&repo.writes==0);String ticket=p.getString("ticket");call("apply",order(ticket,2,0,1));ok(repo.last.next.equals(List.of(state.c,state.a,state.b))&&repo.last.previous.equals(state.prev));fail("apply",order(ticket,2,0,1),"USED");
  p=(JSONObject)call("queue",new JSONObject());state.rev="changed";fail("apply",order(p.getString("ticket"),0,1,2),"STALE");player.options.shuffled=true;fail("queue",new JSONObject(),"SHUFFLE_ON");player.options.shuffled=false;
  JSONObject source=new JSONObject().put("context","spotify:collection:tracks").put("uris",new JSONArray().put(uri(2)).put(uri(1)).put(uri(1)));
  com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=null;fail("prepare",source,"PLAYER_READY");ok(handler.writes==0);com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=handler;
  p=(JSONObject)call("prepare",source);ok(handler.writes==0);call("apply",order(p.getString("ticket"),0,1,2));ok(handler.writes==1&&handler.interceptors==1);
  PlayCommand c=handler.last;ok(c.context.uri.isEmpty()&&c.context.pages.size()==1&&c.context.pages.get(0).tracks.size()==3);ok(c.options.always&&!c.options.overrides.shuffled&&c.options.skip.track==0L&&c.options.skip.page==0L);ok(c.origin.feature.equals("spotifyplus")&&c.origin.view.equals("spotify:collection:tracks"));ok(state.current.b().uri().equals(uri(2))&&state.next.size()==2&&!state.next.get(0).uid().equals(state.next.get(1).uid()));
  handler.noOp=true;p=(JSONObject)call("prepare",source);ticket=p.getString("ticket");fail("apply",order(ticket,0,1,2),"UNCONFIRMED");fail("apply",order(ticket,0,1,2),"USED");ok(handler.writes==2);handler.noOp=false;
  p=(JSONObject)call("prepare",source);com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=new Handler(state);fail("apply",order(p.getString("ticket"),0,1,2),"STALE");ok(handler.writes==2);com.lenerd.spotifyplus.module.hooks.PlayerHook.contextPlayer=handler;
  handler.status="Failure{}";p=(JSONObject)call("prepare",source);fail("apply",order(p.getString("ticket"),0,1,2),"PLAY_REFUSED");handler.status="unexpected";p=(JSONObject)call("prepare",source);fail("apply",order(p.getString("ticket"),0,1,2),"ACK");handler.status="Success{}";
  handler.loseAfterWrite=true;p=(JSONObject)call("prepare",source);ticket=p.getString("ticket");fail("apply",order(ticket,0,1,2),"RPC");int writes=handler.writes;fail("apply",order(ticket,0,1,2),"USED");ok(handler.writes==writes);handler.loseAfterWrite=false;
  repo.noOp=true;p=(JSONObject)call("queue",new JSONObject());fail("apply",order(p.getString("ticket"),1,0),"UNCONFIRMED");repo.noOp=false;repo.rejected=true;p=(JSONObject)call("queue",new JSONObject());fail("apply",order(p.getString("ticket"),0,1),"CONFLICT");
  System.out.println("PASS real command adapter: lazy native pipeline, exact order/duplicates, no-op rejection, handler lifetime, refusal and lost-result no retry");
 }
}''',
}
class ShuffleTests(unittest.TestCase):
 def test_engine_and_native_command(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);files={**FIXTURES,'Harness.java':HARNESS}
   for name in ['ShuffleEngine','NativePlaybackCommand','ShufflePlusBridge']:
    files['com/lenerd46/spotifyplus/api2/'+name+'.java']=(ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2'/f'{name}.java').read_text()
   for name,body in files.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
   c=subprocess.run(['java','com.sun.tools.javac.Main','-d',str(root/'classes'),*[str(p) for p in root.rglob('*.java')]],capture_output=True,text=True)
   self.assertEqual(c.returncode,0,c.stderr)
   for name in ['Harness','AdapterHarness']:
    r=subprocess.run(['java','-cp',str(root/'classes'),name],capture_output=True,text=True)
    self.assertEqual(r.returncode,0,r.stdout+r.stderr)
if __name__=='__main__':unittest.main()
