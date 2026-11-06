"""Execute production Shuffle+ engine and protocol against independent JVM fixtures."""
import pathlib,subprocess,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
FIELDS={
'EsContextTrack$ContextTrack':{'URI':1},'EsContextPage$ContextPage':{'TRACKS':1},
'EsContext$Context':{'PAGES':1,'URI':3},'EsOptional$OptionalInt64':{'VALUE':1},
'EsOptional$OptionalBoolean':{'VALUE':1},'EsSkipToTrack$SkipToTrack':{'TRACK_INDEX':5},
'EsContextPlayerOptions$ContextPlayerOptionOverrides':{'SHUFFLING_CONTEXT':1},
'EsPreparePlayOptions$PreparePlayOptions':{'SKIP_TO':3,'PLAYER_OPTIONS_OVERRIDE':7},
'EsPreparePlay$PreparePlayRequest':{'CONTEXT':1,'OPTIONS':2},'EsPlay$PlayRequest':{'PREPARE_PLAY_REQUEST':1},
'EsResponseWithReasons$ResponseWithReasons':{'ERROR':1}}
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
  ClassLoader loader=Harness.class.getClassLoader();Object request=ShuffleProtocol.play(loader,"spotify:collection:tracks",List.of(uri(2),uri(1),uri(1)));
  System.out.println(java.util.HexFormat.of().formatHex(((fixture.Base)request).wire));
  Class<?> response=ShuffleProtocol.response(loader);ok(ShuffleProtocol.result(response,new byte[0])==0);ok(ShuffleProtocol.result(response,new byte[]{8,1})==1);
  try{ShuffleProtocol.result(response,new byte[]{(byte)128});throw new AssertionError();}catch(java.lang.reflect.InvocationTargetException expected){}
  System.out.println("PASS engine previews, CAS guards, occurrence identity, history, single-use, bounds, uncertainty and native protocol");
 }
}'''
BASE='''package fixture;public class Base {public byte[] wire;
 public static Base parseFrom(Base defaultInstance,byte[] data)throws Exception {
  java.lang.reflect.Constructor<?> c=defaultInstance.getClass().getDeclaredConstructor();c.setAccessible(true);Base result=(Base)c.newInstance();result.wire=data;
  if(defaultInstance.getClass().getName().contains("ResponseWithReasons")) {
   if(data.length>0&&(data.length!=2||data[0]!=8))throw new Exception("malformed fixture response");
   java.lang.reflect.Field f=result.getClass().getDeclaredField("error_");f.setAccessible(true);f.setInt(result,data.length==0?0:data[1]);}
  return result;
 }}'''
FIXTURES={
'android/os/SystemClock.java': 'package android.os; public class SystemClock {public static long elapsedRealtime(){return 0;}}',
'com/lenerd/spotifyplus/module/Utils.java':'package com.lenerd.spotifyplus.module;public class Utils {public static Object playerState;}',
'com/lenerd46/spotifyplus/player/NextUpQueue.java':'package com.lenerd46.spotifyplus.player;public class NextUpQueue {public static Object repo;public static Object currentRepository(){return repo;}}',
'org/json/JSONException.java':'package org.json;public class JSONException extends RuntimeException {}',
'org/json/JSONObject.java':'''package org.json;public class JSONObject {final java.util.Map<String,Object> data=new java.util.HashMap<>();public JSONObject put(String k,Object v){data.put(k,v);return this;}public Object get(String k){if(!data.containsKey(k))throw new JSONException();return data.get(k);}public String getString(String k){Object v=get(k);if(!(v instanceof String))throw new JSONException();return (String)v;}public JSONArray getJSONArray(String k){return (JSONArray)get(k);}public int getInt(String k){return ((Number)get(k)).intValue();}}''',
'org/json/JSONArray.java':'''package org.json;public class JSONArray {final java.util.List<Object> data=new java.util.ArrayList<>();public JSONArray put(Object v){data.add(v);return this;}public int length(){return data.size();}public Object get(int i){return data.get(i);}public String getString(int i){Object v=get(i);if(!(v instanceof String))throw new JSONException();return (String)v;}}''',
'io/reactivex/rxjava3/core/Single.java':'''package io.reactivex.rxjava3.core;public class Single {final Object value;public static boolean lost;public Single(Object value){this.value=value;}public Single timeout(long n,java.util.concurrent.TimeUnit unit){if(n!=15)throw new AssertionError();return this;}public Object blockingGet(){if(lost)throw new IllegalStateException("private error");return value;}}''',
'io/reactivex/rxjava3/core/Flowable.java':'''package io.reactivex.rxjava3.core;public class Flowable {public Object value;public Flowable(Object v){value=v;}public Single firstOrError(){return new Single(value);}}''',
'com/spotify/esperanto/esperanto/ClientBase.java':'''package com.spotify.esperanto.esperanto;public class ClientBase {public int calls;public byte[] reply=new byte[0];public fixture.Base last;public io.reactivex.rxjava3.core.Single callSingle(String service,String method,fixture.Base request){if(!service.equals("spotify.player.esperanto.proto.ContextPlayer")||!method.equals("Play"))throw new AssertionError();calls++;last=request;return new io.reactivex.rxjava3.core.Single(reply);}}''',
'com/spotify/player/model/command/SetQueueCommand.java':'''package com.spotify.player.model.command;public class SetQueueCommand {public String revision;public java.util.List<?> next,previous;public static SetQueueCommand create(String rev,java.util.List<?> next,java.util.List<?> prev){SetQueueCommand c=new SetQueueCommand();c.revision=rev;c.next=next;c.previous=prev;return c;}}''',
'AdapterHarness.java':r'''import org.json.*;import java.util.*;import com.lenerd46.spotifyplus.api2.*;import com.spotify.player.model.command.SetQueueCommand;import io.reactivex.rxjava3.core.*;
public class AdapterHarness {
 static void ok(boolean b){if(!b)throw new AssertionError();}
 static String uri(int n){return "spotify:track:"+String.format("%022d",n);}
 public static class Track {final String uri,uid;Track(int n,String u){uri=AdapterHarness.uri(n);uid=u;}public String uri(){return uri;}public Map<String,String> metadata(){return Map.of("title",uid,"artist_name","Artist","is_queued","true");}public String toString(){return uri+uid;}}
 public static class State {String rev="r";final Track a=new Track(1,"a"),b=new Track(1,"b"),c=new Track(2,"c"),old=new Track(3,"old");final List<Track> next=List.of(a,b,c),prev=List.of(old);public String revision(){return rev;}public List<Track> nextTracks(){return next;}public List<Track> prevTracks(){return prev;}public String toString(){return rev+next+prev+"current-unchanged";}}
 public static class Options {public boolean shuffled;public boolean shufflingContext(){return shuffled;}}
 public static class PlayerState {final Options options=new Options();public Options options(){return options;}}
 public static class Repo {final com.spotify.esperanto.esperanto.ClientBase renamedClient=new com.spotify.esperanto.esperanto.ClientBase();final Flowable renamedStream;int writes;SetQueueCommand last;boolean rejected;Repo(State s){renamedStream=new Flowable(s);}public Single renamedDispatch(SetQueueCommand c){writes++;last=c;return new Single(new Object(){public String toString(){return rejected?"Failure{reasons=private}":"Success{}";}});}}
 static Object call(String operation,JSONObject args)throws Exception{return ShufflePlusBridge.execute(AdapterHarness.class.getClassLoader(),"shuffleplus."+operation,args);}
 static void fail(String operation,JSONObject args,String code)throws Exception{try{call(operation,args);throw new AssertionError("missing "+code);}catch(IllegalStateException e){ok(e.getMessage().equals("SP_SHUFFLE_"+code));}}
 static JSONObject order(String ticket,int... values){JSONArray indices=new JSONArray();for(int i:values)indices.put(i);return new JSONObject().put("ticket",ticket).put("order",indices);}
 public static void main(String[] args)throws Exception{
  State state=new State();Repo repo=new Repo(state);PlayerState player=new PlayerState();com.lenerd46.spotifyplus.player.NextUpQueue.repo=repo;com.lenerd.spotifyplus.module.Utils.playerState=player;
  ok(((JSONObject)call("capabilities",new JSONObject())).getInt("host")==13);
  JSONObject preview=(JSONObject)call("queue",new JSONObject());ok(preview.getInt("count")==3&&repo.writes==0&&repo.renamedClient.calls==0);
  String ticket=preview.getString("ticket");call("apply",order(ticket,2,0,1));ok(repo.writes==1);ok(repo.last.next.equals(List.of(state.c,state.a,state.b)));ok(repo.last.previous.equals(state.prev));ok(repo.last.revision.equals("r"));fail("apply",order(ticket,2,0,1),"USED");
  preview=(JSONObject)call("queue",new JSONObject());ticket=preview.getString("ticket");state.rev="changed";fail("apply",order(ticket,0,1,2),"STALE");ok(repo.writes==1);
  player.options.shuffled=true;fail("queue",new JSONObject(),"SHUFFLE_ON");player.options.shuffled=false;
  JSONObject source=new JSONObject().put("context","spotify:collection:tracks").put("uris",new JSONArray().put(uri(2)).put(uri(1)).put(uri(1)));
  preview=(JSONObject)call("prepare",source);ok(repo.renamedClient.calls==0);ticket=preview.getString("ticket");call("apply",order(ticket,0,1,2));ok(repo.renamedClient.calls==1&&repo.renamedClient.last.wire.length>0);
  preview=(JSONObject)call("prepare",source);repo.renamedClient.reply=new byte[]{8,1};fail("apply",order(preview.getString("ticket"),0,1,2),"FORBIDDEN");ok(repo.renamedClient.calls==2);
  preview=(JSONObject)call("prepare",source);repo.renamedClient.reply=new byte[]{(byte)128};fail("apply",order(preview.getString("ticket"),0,1,2),"ACK");
  preview=(JSONObject)call("queue",new JSONObject());repo.rejected=true;fail("apply",order(preview.getString("ticket"),0,1,2),"CONFLICT");
  System.out.println("PASS actual native adapter reflection, JSON dispatch, queue/current/history, read-only preparation, server refusal and malformed acknowledgment");
 }
}'''
}

def decode(data):
 pos=0;result={}
 def varint():
  nonlocal pos
  value=0;shift=0
  while pos<len(data):
   b=data[pos];pos+=1;value|=(b&127)<<shift
   if b<128:return value
   shift+=7
  raise AssertionError('truncated')
 while pos<len(data):
  tag=varint();field,wire=tag>>3,tag&7
  if wire==0:value=varint()
  elif wire==2:
   size=varint();value=data[pos:pos+size];assert len(value)==size;pos+=size
  else:raise AssertionError(wire)
  result.setdefault(field,[]).append(value)
 return result
class ShuffleTests(unittest.TestCase):
 def test_engine_and_protocol(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);files={**FIXTURES,'fixture/Base.java':BASE,'Harness.java':HARNESS}
   grouped={}
   for name,fields in FIELDS.items():
    outer,inner=name.split('$');grouped.setdefault(outer,[]).append((inner,fields))
   for outer,inners in grouped.items():
    body='package com.spotify.player.esperanto.proto;public final class '+outer+' {'
    for inner,fields in inners:
     body+='public static final class '+inner+' extends fixture.Base {private static final '+inner+' DEFAULT_INSTANCE=new '+inner+'();'
     body+='private int error_;'
     body+=''.join(f'public static final int {key}_FIELD_NUMBER={value};' for key,value in fields.items())+'}'
    files['com/spotify/player/esperanto/proto/'+outer+'.java']=body+'}'
   for name in ['ShuffleEngine','ShuffleProtocol','ShufflePlusBridge']:
    files['com/lenerd46/spotifyplus/api2/'+name+'.java']=(ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2'/f'{name}.java').read_text()
   for name,body in files.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
   compile_result=subprocess.run(['java','com.sun.tools.javac.Main','-d',str(root/'classes'),*[str(p) for p in root.rglob('*.java')]],capture_output=True,text=True)
   self.assertEqual(compile_result.returncode,0,compile_result.stderr)
   result=subprocess.run(['java','-cp',str(root/'classes'),'Harness'],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)
   adapter=subprocess.run(['java','-cp',str(root/'classes'),'AdapterHarness'],capture_output=True,text=True)
   self.assertEqual(adapter.returncode,0,adapter.stdout+adapter.stderr)
   request=decode(bytes.fromhex(result.stdout.splitlines()[0]));prepare=decode(request[1][0]);context=decode(prepare[1][0]);options=decode(prepare[2][0]);page=decode(context[1][0])
   self.assertEqual(context[3][0],b'spotify:collection:tracks');self.assertNotIn(4,context)
   self.assertEqual([decode(t)[1][0].decode() for t in page[1]],['spotify:track:'+str(n).zfill(22) for n in [2,1,1]])
   self.assertEqual(decode(decode(options[3][0])[5][0])[1],[0])
   self.assertEqual(decode(decode(options[7][0])[1][0])[1],[0])
if __name__=='__main__':unittest.main()
