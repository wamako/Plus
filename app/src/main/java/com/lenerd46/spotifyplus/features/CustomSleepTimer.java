package com.lenerd46.spotifyplus.features;
import android.app.*;
import android.content.*;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.*;
import android.graphics.Color;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import com.lenerd46.spotifyplus.References;
import de.robv.android.xposed.*;
import org.json.*;
import java.util.*;

/** Custom timers use Spotify's own media session and survive screen-off during playback. */
public final class CustomSleepTimer {
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static final SleepTimerState state=new SleepTimerState();
    private static volatile MediaController controller;
    private static AlarmManager alarms;
    private static AlarmManager.OnAlarmListener alarm;
    private static Runnable fallback;
    private static SharedPreferences preferences;
    private static boolean initialized;
    private CustomSleepTimer(){}
    public static void initialize(Context context){
        if(initialized)return;initialized=true;
        alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        preferences=context.getSharedPreferences("SpotifyPlus",Context.MODE_PRIVATE);
        XposedHelpers.findAndHookMethod(MediaSession.class,"setPlaybackState",PlaybackState.class,new XC_MethodHook(){protected void afterHookedMethod(MethodHookParam p){MediaController current=((MediaSession)p.thisObject).getController();if("com.spotify.music".equals(current.getPackageName()))controller=current;}});
        com.lenerd46.spotifyplus.hooks.RemoveCreateButtonHook.registerSideButton("Sleep timer",-408,CustomSleepTimer::show);
    }
    public static void cancel(){
        state.cancel();if(alarm!=null&&alarms!=null)alarms.cancel(alarm);if(fallback!=null)main.removeCallbacks(fallback);alarm=null;fallback=null;
    }
    private static void start(long minutes){
        if(controller==null)throw new IllegalStateException("Start Spotify playback before setting a sleep timer.");
        cancel();long token=state.start(SystemClock.elapsedRealtime(),minutes);
        Runnable expire=()->{if(state.takeExpired(token,SystemClock.elapsedRealtime())){
            if(alarm!=null)alarms.cancel(alarm);if(fallback!=null)main.removeCallbacks(fallback);alarm=null;fallback=null;
            MediaController current=controller;if(current!=null)current.getTransportControls().pause();
        }};
        alarm=expire::run;fallback=expire;
        try{alarms.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP,state.deadline(),"SpotifyPlusCustomSleepTimer",alarm,main);
            main.postDelayed(fallback,Math.multiplyExact(minutes,60000L));
        }catch(RuntimeException error){cancel();throw new IllegalStateException("Could not schedule the sleep timer: "+error.getMessage(),error);}
    }
    private static String label(long minutes){return minutes%60==0?(minutes/60)+((minutes==60)?" hour":" hours"):minutes+" minutes";}
    public static void show(){Activity a=References.currentActivity;if(a!=null&&preferences!=null)a.runOnUiThread(()->FeatureSheets.show("Sleep timer",root->new Page(a,root)));}
    private static final class Page {
        final Activity activity;final LinearLayout presets;final TextView status,error;final EditText input;
        final ArrayList<Long> values=new ArrayList<>();boolean hours,save,editing;
        Page(Activity a,LinearLayout root){
            activity=a;status=FeatureSheets.text(a,"",16);root.addView(status);
            root.addView(FeatureSheets.button(a,"Cancel active timer",()->{cancel();refreshStatus();}));
            root.addView(FeatureSheets.text(a,"Pause playback after a custom duration",16));
            input=new EditText(a);input.setTextColor(Color.WHITE);input.setHintTextColor(0xffb7bece);input.setHint("Duration");input.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);input.setSingleLine(true);root.addView(input);
            LinearLayout units=new LinearLayout(a);Button min=FeatureSheets.button(a,"Minutes",()->{}),hr=FeatureSheets.button(a,"Hours",()->{});
            Runnable select=()->{min.setBackgroundTintList(android.content.res.ColorStateList.valueOf(hours?0xff293142:0xff23634f));hr.setBackgroundTintList(android.content.res.ColorStateList.valueOf(hours?0xff23634f:0xff293142));};
            min.setOnClickListener(v->{hours=false;select.run();});hr.setOnClickListener(v->{hours=true;select.run();});select.run();units.addView(min,new LinearLayout.LayoutParams(0,-2,1));units.addView(hr,new LinearLayout.LayoutParams(0,-2,1));root.addView(units);
            Button saving=FeatureSheets.button(a,"Save as preset: No",()->{});saving.setOnClickListener(v->{save=!save;saving.setText(save?"Save as preset: Yes":"Save as preset: No");});root.addView(saving);
            error=FeatureSheets.text(a,"",14);error.setTextColor(0xffffb4b4);root.addView(error);
            root.addView(FeatureSheets.button(a,"Start sleep timer",()->{try{long minutes=SleepTimerState.minutes(input.getText().toString(),hours);start(minutes);if(save&&!values.contains(minutes)){values.add(minutes);persist();render();}error.setText("");refreshStatus();}catch(Exception e){error.setText(e.getMessage());}}));
            root.addView(FeatureSheets.button(a,"Save preset for player menu",()->{try{long minutes=SleepTimerState.minutes(input.getText().toString(),hours);if(!values.contains(minutes)){values.add(minutes);persist();render();}error.setText("");FeatureSheets.toast("Saved. Reopen the player's Sleep timer menu to use it.");}catch(Exception e){error.setText(e.getMessage());}}));
            root.addView(FeatureSheets.text(a,"Saved timers",18));Button edit=FeatureSheets.button(a,"Edit saved timers",()->{});edit.setOnClickListener(v->{editing=!editing;edit.setText(editing?"Done":"Edit saved timers");render();});root.addView(edit);
            presets=FeatureSheets.column(a);root.addView(presets);
            try{JSONArray stored=new JSONArray(preferences.getString("custom_sleep_timers","[{\"value\":5,\"unit\":false},{\"value\":10,\"unit\":false},{\"value\":15,\"unit\":false},{\"value\":30,\"unit\":false},{\"value\":45,\"unit\":false},{\"value\":1,\"unit\":true}]"));for(int i=0;i<stored.length();i++){JSONObject item=stored.getJSONObject(i);try{values.add(SleepTimerState.minutes(item.get("value").toString(),item.optBoolean("unit")));}catch(Exception ignored){}}}catch(Exception ignored){}
            render();refreshStatus();Runnable ticker=new Runnable(){public void run(){if(!status.isAttachedToWindow())return;refreshStatus();status.postDelayed(this,1000);}};
            status.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){public void onViewAttachedToWindow(View v){status.post(ticker);}public void onViewDetachedFromWindow(View v){status.removeCallbacks(ticker);}});
        }
        void refreshStatus(){long left=state.remaining(SystemClock.elapsedRealtime());status.setText(left==0?"No active custom timer":"Playback pauses in "+((left+59999)/60000)+" minutes");}
        void persist(){JSONArray array=new JSONArray();for(long minutes:values){JSONObject value=new JSONObject();try{value.put("value",minutes);value.put("unit",false);array.put(value);}catch(JSONException e){throw new IllegalStateException(e);}}if(!preferences.edit().putString("custom_sleep_timers",array.toString()).commit())throw new IllegalStateException("Could not save timers");}
        void render(){presets.removeAllViews();for(int i=0;i<values.size();i++){final int index=i;long minutes=values.get(i);LinearLayout row=new LinearLayout(activity);Button play=FeatureSheets.button(activity,label(minutes),()->{try{start(minutes);error.setText("");refreshStatus();}catch(Exception e){error.setText(e.getMessage());}});row.addView(play,new LinearLayout.LayoutParams(0,-2,1));
            if(editing){row.addView(FeatureSheets.button(activity,"↑",()->{if(index>0){Collections.swap(values,index,index-1);persist();render();}}));row.addView(FeatureSheets.button(activity,"×",()->{values.remove(index);persist();render();}));}presets.addView(row);
        }}
    }
}
