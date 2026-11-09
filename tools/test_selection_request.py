"""New queue occurrences must retain the pinned Spotify factory's identity fields.

Evidence: original 9.1.94.1929 APK SHA a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304.
ContextTrack.builder(uri) initializes both uid and provider to empty strings.
Spotify's native queue insertion copies metadata and sets is_queued=true without
rewriting either identity field. These tests do not simulate a server or assert
that the construction difference is the cause of the reported phone failure.
"""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = {
    "com/lenerd46/spotifyplus/api2/ShuffleEngine.java": r'''package com.lenerd46.spotifyplus.api2;
public final class ShuffleEngine {
 public static final int LIMIT=10000;
 public static IllegalStateException error(String code){return new IllegalStateException("SP_SHUFFLE_"+code);}
}''',
    "com/spotify/player/model/ContextTrack.java": r'''package com.spotify.player.model;
import java.util.*;
public final class ContextTrack {
 private final String uri,uid,provider; private final Map<String,String> metadata;
 private ContextTrack(Builder b){uri=b.uri;uid=b.uid;provider=b.provider;metadata=Map.copyOf(b.metadata);}
 public String uri(){return uri;} public String uid(){return uid;} public String provider(){return provider;}
 public Map<String,String> metadata(){return metadata;}
 public static Builder builder(String uri){return new Builder(uri);}
 public Builder toBuilder(){return new Builder(uri).uid(uid).provider(provider).metadata(metadata);}
 public static final class Builder {
  private final String uri; private String uid="",provider=""; private Map<String,String> metadata=Map.of();
  private Builder(String uri){this.uri=uri;}
  public Builder uid(String value){uid=value;return this;}
  public Builder provider(String value){provider=value;return this;}
  public Builder metadata(Map<String,String> value){metadata=new LinkedHashMap<>(value);return this;}
  public ContextTrack build(){return new ContextTrack(this);}
 }
}''',
    "com/spotify/player/model/command/options/CommandOptions.java": r'''package com.spotify.player.model.command.options;
public final class CommandOptions {
 public final boolean overrideRestrictions; private CommandOptions(boolean value){overrideRestrictions=value;}
 public static Builder builder(){return new Builder();}
 public static final class Builder {
  private boolean value; public Builder overrideRestrictions(boolean value){this.value=value;return this;}
  public CommandOptions build(){return new CommandOptions(value);}
 }
}''',
    "com/spotify/player/model/command/SetQueueCommand.java": r'''package com.spotify.player.model.command;
import java.util.*;import com.spotify.player.model.command.options.CommandOptions;
public final class SetQueueCommand {
 public final String revision; public final List<?> next,previous; public final CommandOptions options;
 private SetQueueCommand(Builder b){revision=b.revision;next=List.copyOf(b.next);previous=List.copyOf(b.previous);options=b.options;}
 public static Builder builder(String revision,List<?> next,List<?> previous){return new Builder(revision,next,previous);}
 public static final class Builder {
  private final String revision; private final List<?> next,previous; private CommandOptions options;
  private Builder(String revision,List<?> next,List<?> previous){this.revision=revision;this.next=next;this.previous=previous;}
  public Builder options(CommandOptions value){options=value;return this;}
  public SetQueueCommand build(){return new SetQueueCommand(this);}
 }
}''',
    "SelectionRequestHarness.java": r'''import java.util.*;
import com.spotify.player.model.ContextTrack;
import com.spotify.player.model.command.SetQueueCommand;
import com.lenerd46.spotifyplus.api2.NativeQueueCommand;
public final class SelectionRequestHarness {
 static String uri(int value){return "spotify:track:"+String.format("%022d",value);}
 static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 interface Task {void run()throws Exception;}
 static void fails(Task task,String code)throws Exception {
  try{task.run();throw new AssertionError("Expected rejection: "+code);}
  catch(IllegalStateException error){check(error.getMessage().equals("SP_SHUFFLE_"+code),"Unexpected rejection");}
 }
 static NativeQueueCommand.Prepared selection(List<String> uris,List<?> history,List<?> tail,Object delimiter)throws Exception {
  return NativeQueueCommand.prepareSelection(SelectionRequestHarness.class.getClassLoader(),"native-revision",uris,history,tail,delimiter);
 }
 static void fresh()throws Exception {
  ContextTrack nativeFactory=ContextTrack.builder(uri(1)).build();
  check(nativeFactory.uid().isEmpty()&&nativeFactory.provider().isEmpty(),"Fixture must match the pinned APK factory");
  List<String> requested=new ArrayList<>(List.of(uri(2),uri(1),uri(1),uri(3)));
  List<String> before=List.copyOf(requested);
  var prepared=selection(requested,List.of(),List.of(),null);
  check(prepared.next.size()==requested.size(),"Every requested occurrence must be retained");
  for(int i=0;i<requested.size();i++) {
   ContextTrack actual=(ContextTrack)prepared.next.get(i);
   check(actual.uri().equals(requested.get(i)),"Requested occurrence order changed at "+i);
   check(actual.uid().equals(nativeFactory.uid()),"Fresh UID was imposed before native assignment at "+i);
   check(actual.provider().equals(nativeFactory.provider()),"Fresh provider must retain native factory default at "+i+"; got "+actual.provider());
   check(actual.metadata().equals(Map.of("is_queued","true")),"New occurrences must be marked queued");
  }
  check(prepared.next.get(1)!=prepared.next.get(2),"Duplicate URIs must remain distinct occurrence objects");
  check(requested.equals(before),"Input URI list mutated");
  check(nativeFactory.metadata().isEmpty(),"Reference factory object mutated");
 }
 static void preserved()throws Exception {
  ContextTrack autoplay=ContextTrack.builder(uri(9)).uid("native-tail").provider("autoplay").metadata(Map.of("source","native")).build();
  ContextTrack previous=ContextTrack.builder(uri(8)).uid("native-history").provider("context").metadata(Map.of("kept","history")).build();
  Object delimiter=new Object();
  List<Object> history=new ArrayList<>(List.of(previous)),tail=new ArrayList<>(List.of(autoplay));
  var prepared=selection(List.of(uri(1),uri(2)),history,tail,delimiter);
  SetQueueCommand command=(SetQueueCommand)prepared.command;
  check(prepared.next.size()==4&&prepared.next.get(2)==autoplay&&prepared.next.get(3)==delimiter,"Existing tail/delimiter identity changed");
  check(command.revision.equals("native-revision"),"Queue revision changed");
  check(command.previous.size()==1&&command.previous.get(0)==previous,"Native history changed");
  check(command.next.equals(prepared.next)&&command.options.overrideRestrictions,"Native editor command contract changed");
  check(history.equals(List.of(previous))&&tail.equals(List.of(autoplay)),"Caller input lists mutated");
  check(autoplay.uid().equals("native-tail")&&autoplay.provider().equals("autoplay")&&autoplay.metadata().equals(Map.of("source","native")),"Autoplay object mutated");
  check(previous.metadata().equals(Map.of("kept","history")),"History object mutated");
 }
 static void existing()throws Exception {
  ContextTrack a=ContextTrack.builder(uri(1)).uid("queue-occurrence-a").provider("queue").metadata(Map.of("is_queued","true","kept","a")).build();
  ContextTrack b=ContextTrack.builder(uri(1)).uid("context-occurrence-b").provider("context").metadata(Map.of("is_queued","false","kept","b")).build();
  List<ContextTrack> requested=List.of(b,a);
  var prepared=NativeQueueCommand.prepare(SelectionRequestHarness.class.getClassLoader(),"existing",requested,List.of(),1,null);
  for(int i=0;i<requested.size();i++) {
   ContextTrack actual=(ContextTrack)prepared.next.get(i),original=requested.get(i);
   check(actual.uri().equals(original.uri())&&actual.uid().equals(original.uid())&&actual.provider().equals(original.provider()),"Existing occurrence identity changed");
   check(actual.metadata().get("is_queued").equals(Boolean.toString(i==0)),"Existing positional section marker incorrect");
   check(actual.metadata().get("kept").equals(original.metadata().get("kept")),"Unrelated metadata lost");
  }
  check(a.metadata().get("is_queued").equals("true")&&b.metadata().get("is_queued").equals("false"),"Existing input objects mutated");
 }
 static void guards()throws Exception {
  fails(()->selection(List.of(),List.of(),List.of(),null),"LIMIT");
  fails(()->selection(Collections.nCopies(10000,uri(1)),List.of(),List.of(),null),"LIMIT");
  fails(()->selection(List.of("spotify:episode:0000000000000000000001"),List.of(),List.of(),null),"INPUT");
  for(String provider:List.of("queue","context","")) {
   ContextTrack unsafe=ContextTrack.builder(uri(9)).provider(provider).build();
   fails(()->selection(List.of(uri(1)),List.of(),List.of(unsafe),null),"SEQUENCE_CHANGED");
  }
  ContextTrack manual=ContextTrack.builder(uri(9)).provider("autoplay").metadata(Map.of("is_queued","true")).build();
  fails(()->selection(List.of(uri(1)),List.of(),List.of(manual),null),"SEQUENCE_CHANGED");
 }
 public static void main(String[] args)throws Exception {
  switch(args[0]){case "fresh":fresh();break;case "preserved":preserved();break;case "existing":existing();break;case "guards":guards();break;default:throw new AssertionError();}
  System.out.println("PASS "+args[0]);
 }
}''',
}


class SelectionRequestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = pathlib.Path(cls.temporary.name)
        files = dict(FIXTURES)
        source = ROOT / "app/src/main/java/com/lenerd46/spotifyplus/api2/NativeQueueCommand.java"
        files["com/lenerd46/spotifyplus/api2/NativeQueueCommand.java"] = source.read_text()
        for name, body in files.items():
            path = cls.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)
        compiled = subprocess.run(
            ["java", "com.sun.tools.javac.Main", "-d", str(cls.root / "classes"),
             *[str(p) for p in cls.root.rglob("*.java")]], capture_output=True, text=True)
        if compiled.returncode:
            cls.temporary.cleanup()
            raise AssertionError(compiled.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def run_case(self, name):
        result = subprocess.run(
            ["java", "-cp", str(self.root / "classes"), "SelectionRequestHarness", name],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_fresh_occurrences_retain_native_factory_identity_and_duplicates(self):
        self.run_case("fresh")

    def test_existing_native_tail_history_revision_and_inputs_are_preserved(self):
        self.run_case("preserved")

    def test_reordering_existing_occurrences_keeps_native_identity(self):
        self.run_case("existing")

    def test_unsafe_or_unbounded_selection_is_rejected(self):
        self.run_case("guards")


if __name__ == "__main__":
    unittest.main()
