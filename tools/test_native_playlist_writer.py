"""Run the production writer on the JVM with renamed protobuf/Rx transport fixtures.

No Spotify code is copied into these fixtures. Field numbers were checked against
9.1.94's APK; fixtures deliberately provide no generated builder aliases.
"""
import pathlib, shutil, subprocess, tempfile, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
PRODUCTION = ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2/NativePlaylistWriter.java'

SCHEMAS = {
'com.spotify.playlist.proto.ModificationRequest': [('OPERATION',1,'String','operation_'),('BEFORE',2,'String','before_'),('AFTER',3,'String','after_'),('NAME',4,'String','name_'),('PLAYLIST',5,'boolean','playlist_'),('URIS',7,'java.util.List<String>','uris_'),('CREATION_INFO',14,'com.spotify.playlist.proto.CreationInfo','creationInfo_')],
'com.spotify.playlist.proto.CreationInfo': [('ORIGIN_TYPE',1,'int','originType_')],
'com.spotify.playlist.proto.ModificationResponse': [('SUCCESS',1,'boolean','success_'),('URI',2,'String','uri_')],
'spotify.playlist.esperanto.proto.RootlistModificationRequest': [('FOLDER_URI',1,'String','folderUri_'),('REQUEST',2,'com.spotify.playlist.proto.ModificationRequest','request_')],
'spotify.playlist.esperanto.proto.PlaylistModificationRequest': [('URI',1,'String','uri_'),('REQUEST',2,'com.spotify.playlist.proto.ModificationRequest','request_')],
'spotify.playlist.esperanto.proto.RootlistModificationResponse': [('STATUS',1,'spotify.playlist.esperanto.proto.ResponseStatus','status_'),('RESPONSE',2,'com.spotify.playlist.proto.ModificationResponse','response_')],
'spotify.playlist.esperanto.proto.PlaylistModificationResponse': [('STATUS',1,'spotify.playlist.esperanto.proto.ResponseStatus','status_')],
'spotify.playlist.esperanto.proto.ResponseStatus': [('STATUS_CODE',1,'int','statusCode_')],
}
FIXTURES = {
'fixture/Base.java': '''package fixture;
import java.lang.reflect.*; import java.util.*;
public class Base {
 public final Map<Integer,Object> wire=new HashMap<>();
 public static Base parseFrom(Base prototype,byte[] bytes) throws Exception {
  Constructor<?> ctor=prototype.getClass().getDeclaredConstructor();ctor.setAccessible(true);
  Base out=(Base)ctor.newInstance(); int[] pos={0};
  while(pos[0]<bytes.length){int tag=varint(bytes,pos),n=tag>>>3,w=tag&7;Object value;
   if(w==0)value=varint(bytes,pos);
   else if(w==2){int size=varint(bytes,pos);if(size<0||pos[0]+size>bytes.length)throw new Exception();value=Arrays.copyOfRange(bytes,pos[0],pos[0]+size);pos[0]+=size;}
   else throw new Exception();out.wire.put(n,value);
   Field f=out.getClass().getDeclaredField(out.getClass().getMethod("field",int.class).invoke(null,n).toString());f.setAccessible(true);
   Class<?> type=f.getType();
   if(type==int.class)f.setInt(out,(Integer)value);
   else if(type==boolean.class)f.setBoolean(out,(Integer)value!=0);
   else if(type==String.class)f.set(out,new String((byte[])value,java.nio.charset.StandardCharsets.UTF_8));
   else if(List.class.isAssignableFrom(type)){List list=(List)f.get(out);if(list==null){list=new ArrayList();f.set(out,list);}list.add(new String((byte[])value,java.nio.charset.StandardCharsets.UTF_8));}
   else {Field def=type.getDeclaredField("DEFAULT_INSTANCE");def.setAccessible(true);f.set(out,parseFrom((Base)def.get(null),(byte[])value));}
  }return out;
 }
 static int varint(byte[] b,int[] p)throws Exception{int v=0,s=0;while(p[0]<b.length&&s<35){int n=b[p[0]++]&255;v|=(n&127)<<s;if(n<128)return v;s+=7;}throw new Exception();}
}''',
'io/reactivex/rxjava3/core/Single.java': '''package io.reactivex.rxjava3.core;
public class Single {final byte[] bytes; final boolean lost;public Single(byte[] b,boolean l){bytes=b;lost=l;}
 public Single timeout(long n,java.util.concurrent.TimeUnit unit){if(n!=15||unit!=java.util.concurrent.TimeUnit.SECONDS)throw new AssertionError();return this;}
 public Object blockingGet(){if(lost)throw new IllegalStateException("private-account-token");return bytes;}}
''',
'com/spotify/esperanto/esperanto/ClientBase.java': '''package com.spotify.esperanto.esperanto;
public class ClientBase {
 public int calls; public String service,method; public fixture.Base request; public byte[] response; public boolean lost;
 public io.reactivex.rxjava3.core.Single callSingle(String s,String m,fixture.Base r){calls++;service=s;method=m;request=r;return new io.reactivex.rxjava3.core.Single(response,lost);}
}''',
'Harness.java': '''import java.util.*;import java.lang.reflect.*;import com.lenerd46.spotifyplus.api2.NativePlaylistWriter;
import com.spotify.esperanto.esperanto.ClientBase;
public class Harness {
 static class Repo {private final ClientBase renamedClient;Repo(ClientBase c){renamedClient=c;}}
 static class Ambiguous {private final ClientBase one=new ClientBase(),two=new ClientBase();}
 static void ok(boolean v){if(!v)throw new AssertionError();}
 static Object field(Object v,String n)throws Exception{Field f=v.getClass().getDeclaredField(n);f.setAccessible(true);return f.get(v);}
 static byte[] hex(String s){return java.util.HexFormat.of().parseHex(s);}
 static void fails(Runnable r,String code){try{r.run();throw new AssertionError("Missing "+code);}catch(IllegalStateException e){ok(e.getMessage().equals("SP_PLAYLIST_"+code));ok(!e.getMessage().contains("private"));}}
 public static void main(String[] args)throws Exception{
  ClientBase c=new ClientBase();NativePlaylistWriter w=new NativePlaylistWriter(Harness.class.getClassLoader(),new Repo(c));
  String uri="spotify:playlist:0000000000000000000088",track="spotify:track:0000000000000000000001";
  c.response=hex("0a0308c801122b08011227"+java.util.HexFormat.of().formatHex(uri.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  ok(w.create("Café 🎵").equals(uri));ok(c.calls==1);ok(c.service.equals("spotify.playlist_esperanto.proto.RootlistModificationService"));ok(c.method.equals("Modify"));
  ok(field(c.request,"folderUri_").equals(""));Object change=field(c.request,"request_");
  ok(field(change,"operation_").equals("create"));ok(field(change,"before_").equals("start"));ok(field(change,"name_").equals("Café 🎵"));ok((Boolean)field(change,"playlist_"));
  ok((Integer)field(field(change,"creationInfo_"),"originType_")==1);
  // Independent wire bytes assert ordering, field tags and Unicode lengths.
  ok(java.util.HexFormat.of().formatHex((byte[])c.request.wire.get(2)).equals("0a066372656174652801220a436166c3a920f09f8eb51205737461727472020801"));
  c.response=hex("0a0308c801");w.addTracks(uri,List.of(track,track));ok(c.calls==2);ok(c.service.equals("spotify.playlist_esperanto.proto.PlaylistService"));ok(field(c.request,"uri_").equals(uri));
  change=field(c.request,"request_");ok(field(change,"operation_").equals("add"));ok(field(change,"after_").equals("end"));ok(field(change,"uris_").equals(List.of(track,track)));
  int count=c.calls;fails(()->w.create(" "),"PREPARE_INPUT");fails(()->w.addTracks(uri,List.of("invalid")),"PREPARE_INPUT");fails(()->w.addTracks(uri,Collections.nCopies(101,track)),"PREPARE_INPUT");ok(c.calls==count);
  fails(()->new NativePlaylistWriter(Harness.class.getClassLoader(),null).create("copy"),"PREPARE_CLIENT");
  fails(()->new NativePlaylistWriter(Harness.class.getClassLoader(),new Ambiguous()).create("copy"),"PREPARE_CLIENT");
  c.lost=true;fails(()->w.create("copy"),"RPC");ok(c.calls==++count);c.lost=false;
  c.response=hex("0a03089303");fails(()->w.create("copy"),"REJECTED_403");ok(c.calls==++count);
  for(String bad:new String[]{"","00","0a00","0a0308c801","0a0308c80112020800"}){c.response=hex(bad);fails(()->w.create("copy"),"ACK");ok(c.calls==++count);}
  System.out.println("PASS native playlist request bytes, renamed schemas/client, acknowledgments and failure stages");
 }
}'''
}

def schema_source(name, fields):
 package, cls=name.rsplit('.',1)
 out=f'package {package}; public final class {cls} extends fixture.Base {{\nprivate static final {cls} DEFAULT_INSTANCE=new {cls}();private {cls}(){{}}\n'
 for key,n,kind,field in fields: out+=f'public static final int {key}_FIELD_NUMBER={n};private {kind} {field};\n'
 out+='public static String field(int n){switch(n){'
 for key,n,kind,field in fields:out+=f'case {n}:return "{field}";'
 out+='default:throw new IllegalArgumentException();}}'
 if cls=='CreationInfo':out+='public enum Renamed { a; public int getNumber(){return 1;} public String unused(){return "";} } public enum Origin { ORIGIN_TYPE_FRESH; public int getNumber(){return 1;} } public void renamed(Origin o){}'
 return out+'}'

class NativePlaylistTests(unittest.TestCase):
 def test_production_writer(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder)
   files={**FIXTURES,**{name.replace('.','/')+'.java':schema_source(name,fields) for name,fields in SCHEMAS.items()}}
   files['com/lenerd46/spotifyplus/api2/NativePlaylistWriter.java']=PRODUCTION.read_text()
   for name,body in files.items():
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
   sources=[str(p) for p in root.rglob('*.java')]
   subprocess.run(['java','com.sun.tools.javac.Main','-encoding','UTF-8','-d',str(root/'classes'),*sources],check=True,capture_output=True,text=True)
   result=subprocess.run(['java','-cp',str(root/'classes'),'Harness'],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__':unittest.main()
