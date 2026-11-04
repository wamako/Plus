package com.lenerd46.spotifyplus.features;
import android.app.Activity;
import android.content.*;
import android.widget.*;
import com.lenerd46.spotifyplus.References;
import de.robv.android.xposed.XposedHelpers;
import java.util.*;
import java.util.concurrent.*;
import java.lang.reflect.*;

public final class RecentlyPlayed {
    private static PlaybackHistory history;
    public static void initialize(Context context){
        SharedPreferences prefs=context.getSharedPreferences("SpotifyPlusPlaybackHistory",Context.MODE_PRIVATE);
        history=new PlaybackHistory(new PlaybackHistory.Storage(){public String read(){return prefs.getString("state","{}");}public void write(String json){if(!prefs.edit().putString("state",json).commit())throw new IllegalStateException("Could not save playback history");}});
    }
    public static void observe(Object state){
        try{
            if(history==null||!(Boolean)XposedHelpers.callMethod(state,"isPlaying")||(Boolean)XposedHelpers.callMethod(state,"isPaused"))return;
            Object optional=XposedHelpers.callMethod(state,"track");if(!(Boolean)XposedHelpers.callMethod(optional,"c"))return;
            Object track=XposedHelpers.callMethod(optional,"b");
            history.observe(item(track),true,System.currentTimeMillis());
        }catch(Exception ignored){}
    }
    private static BookmarkCollection.Item item(Object track){
        String uri=(String)XposedHelpers.callMethod(track,"uri");Map<?,?> metadata=(Map<?,?>)XposedHelpers.callMethod(track,"metadata");
        return new BookmarkCollection.Item(uri,(String)metadata.get("title"),(String)metadata.get("artist_name"),(String)metadata.get("image_large_url"));
    }
    public static void show(){
        Activity a=References.currentActivity;if(a==null||history==null)return;
        a.runOnUiThread(()->FeatureSheets.show("Recently played",root->{
            TextView detail=FeatureSheets.text(a,"Previously played songs on this device, newest first.",14);root.addView(detail);
            ListView list=new ListView(a);root.addView(list,new LinearLayout.LayoutParams(-1,0,1));render(a,list,detail);
            // Spotify may already hold earlier songs from before this module was installed.
            new Thread(()->{try{
                Object repository=com.lenerd46.spotifyplus.player.NextUpQueue.currentRepository();if(repository==null)return;
                Object stream=null;for(Field f:repository.getClass().getDeclaredFields()){f.setAccessible(true);Object value=f.get(repository);if(value!=null&&isFlowable(value.getClass())){stream=value;break;}}
                if(stream==null)return;
                Class<?> single=XposedHelpers.findClass("io.reactivex.rxjava3.core.Single",repository.getClass().getClassLoader());
                Method read=Arrays.stream(stream.getClass().getMethods()).filter(m->!Modifier.isStatic(m.getModifiers())&&m.getParameterCount()==0&&single.isAssignableFrom(m.getReturnType())).findFirst().orElseThrow();
                Object snapshot=XposedHelpers.callMethod(XposedHelpers.callMethod(read.invoke(stream),"timeout",3L,TimeUnit.SECONDS),"blockingGet");
                List<BookmarkCollection.Item> previous=new ArrayList<>();for(Object track:(Iterable<?>)XposedHelpers.callMethod(snapshot,"prevTracks")){try{previous.add(item(track));}catch(Exception ignored){}}
                history.importPrevious(previous,System.currentTimeMillis());a.runOnUiThread(()->render(a,list,detail));
            }catch(Exception ignored){}},"SpotifyPlus-PreviousTracks").start();
        }));
    }
    private static boolean isFlowable(Class<?> type){for(;type!=null;type=type.getSuperclass())if(type.getName().equals("io.reactivex.rxjava3.core.Flowable"))return true;return false;}
    private static void render(Activity a,ListView list,TextView detail){
        List<PlaybackHistory.Entry> entries=history.entries();List<String> labels=new ArrayList<>();for(var e:entries)labels.add(e.track.title+"\n"+e.track.artist);
        detail.setText(entries.isEmpty()?"Play a song, then another. The previous song will appear here.":"Previously played songs on this device, newest first.");
        list.setAdapter(new ArrayAdapter<>(a,android.R.layout.simple_list_item_1,labels));
        list.setOnItemClickListener((parent,view,position,id)->FeatureSheets.openSpotify(entries.get(position).track.uri));
    }
}
