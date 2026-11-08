"""Exercise production collection verification against ordered/provider-rich windows."""
import pathlib,subprocess,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
HARNESS=r'''import java.util.*;import com.lenerd46.spotifyplus.api2.CollectionOrder;
public class CollectionHarness {
 static void ok(boolean v){if(!v)throw new AssertionError();}
 static String uri(int n){return "spotify:track:"+String.format("%022d",n);}
 public static class Track {String uri,provider;final Map<String,String> metadata=new HashMap<>();Track(int n,String p){uri=CollectionHarness.uri(n);provider=p;}Track(String u){uri=u;provider="context";}public String uri(){return uri;}public String provider(){return provider;}public Map<String,String> metadata(){return metadata;}}
 static List<String> selection(int count){List<String> r=new ArrayList<>();for(int i=1;i<=count;i++)r.add(uri(i));return r;}
 static List<Track> window(int count,String provider,int extras){List<Track> r=new ArrayList<>();for(int i=2;i<=count;i++)r.add(new Track(i,"context"));for(int i=0;i<extras;i++)r.add(new Track(100+i,provider));return r;}
 public static void main(String[] args)throws Exception {
  var expected=selection(14);Track current=new Track(1,"context");var next=window(14,"autoplay",45);var original=new ArrayList<>(next);
  var v=CollectionOrder.inspect(current,next,expected);ok(v.matches&&v.prefixMatches&&v.selectionCompleteInWindow&&v.autoplayTailOnly&&v.autoplayTailCount==45&&v.expectedUpcomingCount==13&&v.matchingUpcomingPrefixCount==13&&next.size()==58);ok(next.equals(original));
  Collections.swap(next,0,1);ok(!CollectionOrder.inspect(current,next,expected).matches);
  for(String provider:Arrays.asList("context","queue","unknown",null)){v=CollectionOrder.inspect(current,window(14,provider,45),expected);ok(!v.matches&&v.selectionCompleteInWindow);ok(provider==null||!provider.equals("context")||v.contextTailCount==45);ok(!"queue".equals(provider)||v.queuedTailCount==45);}
  next=window(14,"autoplay",45);next.remove(12);v=CollectionOrder.inspect(current,next,expected);ok(!v.matches&&v.matchingUpcomingPrefixCount==12&&v.autoplayInSelectionCount==1);
  next=window(14,"autoplay",2);next.get(12).provider="autoplay";v=CollectionOrder.inspect(current,next,expected);ok(v.matches&&v.selectionCompleteInWindow&&v.autoplayInSelectionCount==1);
  next=window(14,"autoplay",45);ok(!CollectionOrder.inspect(new Track(2,"context"),next,expected).matches);ok(!CollectionOrder.inspect(null,next,expected).matches);
  v=CollectionOrder.inspect(current,new ArrayList<>(next.subList(0,5)),expected);ok(v.matches&&!v.selectionCompleteInWindow&&v.autoplayTailCount==0);
  ok(!CollectionOrder.inspect(current,List.of(),expected).matches);
  v=CollectionOrder.inspect(current,window(1,"autoplay",2),selection(1));ok(v.matches&&v.selectionCompleteInWindow&&v.autoplayTailCount==2);
  next=window(14,"autoplay",2);next.get(13).metadata.put("is_queued","true");v=CollectionOrder.inspect(current,next,expected);ok(!v.matches&&v.queuedTailCount==1);
  next=window(14,"autoplay",2);next.get(13).uri="spotify:episode:0000000000000000000001";ok(!CollectionOrder.inspect(current,next,expected).matches);
  next=window(14,"context",0);next.add(new Track("spotify:delimiter"));v=CollectionOrder.inspect(current,next,expected);ok(v.matches&&v.delimiterTailCount==1);
  next=window(14,"context",0);next.set(3,new Track("spotify:delimiter"));ok(!CollectionOrder.inspect(current,next,expected).matches);
  next=window(14,"autoplay",2);next.add(14,new Track("spotify:delimiter"));ok(!CollectionOrder.inspect(current,next,expected).matches);
  next=window(14,"autoplay",2);next.add(13,new Track("spotify:meta:delimiter"));v=CollectionOrder.inspect(current,next,expected);ok(v.matches&&v.autoplayTailCount==2&&v.delimiterTailCount==1);
  var duplicate=List.of(uri(1),uri(2),uri(1));next=new ArrayList<>(List.of(new Track(2,"context"),new Track(1,"context"),new Track(100,"autoplay")));ok(CollectionOrder.inspect(current,next,duplicate).matches);next.remove(1);ok(!CollectionOrder.inspect(current,next,duplicate).matches);
  System.out.println("PASS selected order, duplicates, visible windows, typed tails and 14+45 report regression");
 }
}'''
class CollectionOrderTests(unittest.TestCase):
 def test_selected_order_and_typed_autoplay_tail(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);p=root/'com/lenerd46/spotifyplus/api2/CollectionOrder.java';p.parent.mkdir(parents=True);p.write_text((ROOT/'app/src/main/java/com/lenerd46/spotifyplus/api2/CollectionOrder.java').read_text());(root/'CollectionHarness.java').write_text(HARNESS)
   c=subprocess.run(['java','com.sun.tools.javac.Main','-d',str(root/'classes'),str(p),str(root/'CollectionHarness.java')],capture_output=True,text=True);self.assertEqual(c.returncode,0,c.stderr)
   r=subprocess.run(['java','-cp',str(root/'classes'),'CollectionHarness'],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stdout+r.stderr)
if __name__=='__main__':unittest.main()
