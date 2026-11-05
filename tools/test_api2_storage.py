"""Exercise the actual generated Android storage handler on the JVM.

Android context/preferences interfaces and the native handler registry are test
adapters. The production StorageHook.java executes its own set/get/remove and
private file operations against real temporary files, including a fresh context.
"""
import ast
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from verify_api2_assets import validate_storage_classes

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOOK = ROOT / 'app/api2-generated/java/com/lenerd/spotifyplus/module/hooks/StorageHook.java'

STUBS = {
'android/content/Context.java': '''package android.content;
public abstract class Context { public static final int MODE_PRIVATE=0;
 public abstract SharedPreferences getSharedPreferences(String name,int mode);
 public abstract java.io.File getFilesDir(); public abstract java.io.File getCacheDir(); }''',
'android/app/Activity.java': '''package android.app;
public abstract class Activity extends android.content.Context {}''',
'android/content/SharedPreferences.java': '''package android.content;
public interface SharedPreferences { java.util.Map<String,?> getAll(); Editor edit();
 interface Editor { Editor putString(String key,String value); Editor remove(String key); void apply(); } }''',
'android/util/Base64.java': '''package android.util;
public final class Base64 { public static final int NO_WRAP=2;
 public static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}
 public static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);} }''',
'android/util/Log.java': 'package android.util; public final class Log {}',
'org/json/JSONObject.java': 'package org.json; public class JSONObject { public static final Object NULL=new Object(); }',
'org/json/JSONArray.java': 'package org.json; public class JSONArray {}',
'org/json/JSONTokener.java': 'package org.json; public class JSONTokener {}',
'com/lenerd/spotifyplus/manager/bridge/BridgeClient.java': 'package com.lenerd.spotifyplus.manager.bridge; public class BridgeClient {}',
'com/lenerd/spotifyplus/module/SpotifyCallback.java': 'package com.lenerd.spotifyplus.module; public class SpotifyCallback {}',
'com/lenerd/spotifyplus/module/SpotifyHook.java': '''package com.lenerd.spotifyplus.module;
public abstract class SpotifyHook { public static android.app.Activity currentActivity;
 public void init() throws Exception { hookSetup(); } protected abstract void hookSetup() throws Exception;
 protected abstract void beforeHook(SpotifyCallback c); protected abstract void afterHook(SpotifyCallback c);
 public abstract Object handle(String command,Object[] args); protected static void logError(Exception e) {} }''',
'com/lenerd/spotifyplus/module/scripting/ScriptManager.java': 'package com.lenerd.spotifyplus.module.scripting; public class ScriptManager {}',
'com/lenerd/spotifyplus/module/scripting/SpotifyNativeBridge.java': '''package com.lenerd.spotifyplus.module.scripting;
public final class SpotifyNativeBridge {
 public static final java.util.Map<String,com.lenerd.spotifyplus.module.SpotifyHook> handlers=new java.util.HashMap<>();
 public static void registerHandler(String name,com.lenerd.spotifyplus.module.SpotifyHook hook){handlers.put(name,hook);}
 public static class StorageReadResult { public boolean found; public String type,value,data;
  public StorageReadResult(){this(false,"",null,null);} public StorageReadResult(boolean f,String t,String v,String d){found=f;type=t;value=v;data=d;} }
}''',
'StorageHarness.java': r'''import java.io.*; import java.nio.file.*; import java.util.*;
import android.content.*;
import com.lenerd.spotifyplus.module.SpotifyHook;
import com.lenerd.spotifyplus.module.hooks.StorageHook;
import com.lenerd.spotifyplus.module.scripting.SpotifyNativeBridge;
public class StorageHarness {
 static class Prefs implements SharedPreferences {
  final Properties props=new Properties(); final Path path;
  Prefs(Path p){path=p;try{if(Files.exists(p))try(InputStream in=Files.newInputStream(p)){props.load(in);}}catch(IOException e){throw new RuntimeException(e);}}
  public Map<String,?> getAll(){Map<String,String> copy=new HashMap<>();for(String k:props.stringPropertyNames())copy.put(k,props.getProperty(k));return copy;}
  public Editor edit(){return new Editor(){
   public Editor putString(String k,String v){props.setProperty(k,v);return this;}
   public Editor remove(String k){props.remove(k);return this;}
   public void apply(){try{Files.createDirectories(path.getParent());try(OutputStream out=Files.newOutputStream(path)){props.store(out,"");}}catch(IOException e){throw new RuntimeException(e);}}
  };}
 }
 static class App extends android.app.Activity {
  final Path root; App(Path p){root=p;}
  public SharedPreferences getSharedPreferences(String name,int mode){if(mode!=MODE_PRIVATE)throw new AssertionError("private mode required");return new Prefs(root.resolve("prefs").resolve(Base64.getUrlEncoder().encodeToString(name.getBytes())));}
  public File getFilesDir(){return root.resolve("files").toFile();}
  public File getCacheDir(){return root.resolve("cache").toFile();}
 }
 static Object call(String command,Object... args){var h=SpotifyNativeBridge.handlers.get("storage");if(h==null)return null;return h.handle(command,args);}
 static void equal(Object a,Object b){if(!Objects.equals(a,b))throw new AssertionError("storage round-trip mismatch");}
 public static void main(String[] args)throws Exception {
  Path root=Path.of(args[0]);Files.createDirectories(root.resolve("files"));Files.createDirectories(root.resolve("cache"));
  SpotifyHook.currentActivity=new App(root);
  equal(call("get","com.wamako.genres","lastfm-key"),null); // Reproduces the unregistered R10 route.
  new StorageHook().init();
  if(!SpotifyNativeBridge.handlers.containsKey("storage"))throw new AssertionError("handler not registered");
  String script="com.wamako.genres", key="\"0123456789abcdef0123456789abcdef\"";
  call("set",script,"lastfm-key",key); call("set",script,"musicbrainz-enabled","true");
  call("set",script,"metadata-cache-v2","{\"value\":1}");
  call("set","com.wamako.sortplay","liked-username","\"account-123\"");
  equal(call("get",script,"lastfm-key"),key); equal(call("get",script,"musicbrainz-enabled"),"true");
  equal(call("get",script,"metadata-cache-v2"),"{\"value\":1}");
  equal(call("get","com.wamako.playlistplus","lastfm-key"),null);
  SpotifyHook.currentActivity=new App(root); new StorageHook().init(); // Fresh context reads persisted files.
  equal(call("get",script,"lastfm-key"),key); equal(call("get","com.wamako.sortplay","liked-username"),"\"account-123\"");
  call("remove",script,"lastfm-key"); equal(call("get",script,"lastfm-key"),null);
  equal(call("get",script,"musicbrainz-enabled"),"true");
  call("writeJson",script,"settings/example.json","{\"value\":1}");
  var json=(SpotifyNativeBridge.StorageReadResult)call("read",script,"settings/example.json");
  if(!json.found)throw new AssertionError("JSON file missing");equal(json.type,"json");equal(json.value,"{\"value\":1}");
  call("writeText","spotifyplus-cache:"+script,"temp.txt","hello");
  var cached=(SpotifyNativeBridge.StorageReadResult)call("read","spotifyplus-cache:"+script,"temp.txt");
  if(!cached.found)throw new AssertionError("cache file missing");equal(cached.value,"hello");
  call("remove","spotifyplus-delete:"+script,"settings/example.json");
  if(((SpotifyNativeBridge.StorageReadResult)call("read",script,"settings/example.json")).found)throw new AssertionError("file removal failed");
  call("writeText",script,"../../escape.txt","not allowed");
  if(Files.exists(root.resolve("escape.txt")))throw new AssertionError("sandbox escape");
  System.out.println("PASS: production StorageHook registration, preferences, context reload, isolation and private files");
 }
}'''
}

class Api2StorageTest(unittest.TestCase):
    def test_startup_copies_and_registers_handler_before_host_activation(self):
        tree=ast.parse((ROOT/'tools/prepare_api2.py').read_text())
        selected=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='selected' for t in n.targets))
        self.assertIn('module/hooks/StorageHook.java',selected)
        runtime=(ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2/Api2Runtime.java').read_text()
        self.assertLess(runtime.index('new StorageHook().init(loader,dex);'),runtime.index('findAndHookMethod(Activity.class,"onResume"'))
    def test_apk_validation_rejects_missing_storage_handler(self):
        runtime='Lcom/lenerd46/spotifyplus/api2/Api2Runtime;'
        with self.assertRaisesRegex(AssertionError,'storage handler'):validate_storage_classes({runtime})
        validate_storage_classes({runtime,'Lcom/lenerd/spotifyplus/module/hooks/StorageHook;'})
    @unittest.skipUnless(shutil.which('java') and HOOK.is_file(),'Requires prepared API-2 StorageHook source and a JDK')
    def test_production_handler_persists_values_and_private_files(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory); source=work/'src';out=work/'classes';out.mkdir()
            for name,content in STUBS.items():
                path=source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
            path=source/'com/lenerd/spotifyplus/module/hooks/StorageHook.java';path.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HOOK,path)
            result=subprocess.run(['java','com.sun.tools.javac.Main','-d',str(out),*[str(p) for p in source.rglob('*.java')]],capture_output=True,text=True)
            self.assertEqual(0,result.returncode,result.stderr)
            result=subprocess.run(['java','-cp',str(out),'StorageHarness',str(work/'data')],capture_output=True,text=True)
            self.assertEqual(0,result.returncode,result.stderr)
            self.assertIn('PASS: production StorageHook',result.stdout)
