package com.lenerd46.spotifyplus.features;

import android.content.Context;
import android.graphics.*;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.LruCache;
import android.view.*;
import android.widget.*;
import com.lenerd46.spotifyplus.ArtworkSource;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import java.util.concurrent.*;

/** Playback history lives inside Spotify's Queue sheet, above the unchanged upcoming queue. */
public final class QueuePlaybackHistory {
    private static final int TAG=0x53504851;
    private static final ExecutorService images=Executors.newFixedThreadPool(2);
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static final LruCache<String,Bitmap> covers=new LruCache<String,Bitmap>(4*1024*1024){protected int sizeOf(String key,Bitmap image){return image.getByteCount();}};
    private final LinearLayout section,rows;
    private final ScrollView scroll;
    private String signature="";
    private int visibleLimit=20;
    private final Runnable update=new Runnable(){public void run(){if(!section.isAttachedToWindow())return;render();section.postDelayed(this,1000);}};
    private QueuePlaybackHistory(LinearLayout parent,View content){
        Context context=parent.getContext();
        section=FeatureSheets.column(context);section.setPadding(dp(16),dp(8),dp(16),dp(8));
        TextView heading=FeatureSheets.text(context,"Previously played",16);heading.setTypeface(null,1);heading.setPadding(0,0,0,dp(6));section.addView(heading);
        scroll=new ScrollView(context);scroll.setFillViewport(false);scroll.setNestedScrollingEnabled(true);
        rows=FeatureSheets.column(context);scroll.addView(rows);section.addView(scroll,new LinearLayout.LayoutParams(-1,dp(64)));
        scroll.setOnTouchListener((v,event)->{v.getParent().requestDisallowInterceptTouchEvent(event.getActionMasked()!=MotionEvent.ACTION_UP&&event.getActionMasked()!=MotionEvent.ACTION_CANCEL);return false;});
        // Confirmed queue XML: vertical column -> header + FrameLayout(recycler + Compose host).
        LinearLayout.LayoutParams original=(LinearLayout.LayoutParams)content.getLayoutParams();
        LinearLayout.LayoutParams remaining=new LinearLayout.LayoutParams(original);remaining.height=0;remaining.weight=1;
        content.setLayoutParams(remaining);
        parent.addView(section,parent.indexOfChild(content),new LinearLayout.LayoutParams(-1,-2));
        section.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){
            public void onViewAttachedToWindow(View view){start();}
            public void onViewDetachedFromWindow(View view){section.removeCallbacks(update);}
        });
        render();if(section.isAttachedToWindow())start();
    }
    public static void attach(LinearLayout parent,View content){
        if(parent.getTag(TAG)!=null)return;
        parent.setTag(TAG,new QueuePlaybackHistory(parent,content));
    }
    private int dp(int value){return FeatureSheets.dp(section.getContext(),value);}
    private void start(){section.removeCallbacks(update);section.post(update);RecentlyPlayed.refreshFromQueue(()->{if(section.isAttachedToWindow())render();});}
    private void render(){
        java.util.List<PlaybackHistory.Entry> entries=RecentlyPlayed.entries();
        StringBuilder fingerprint=new StringBuilder().append(visibleLimit);
        for(PlaybackHistory.Entry entry:entries)fingerprint.append('|').append(entry.playedAt).append(entry.track.uri).append(entry.track.title).append(entry.track.artwork);
        String current=fingerprint.toString();if(signature.equals(current))return;signature=current;
        int previousScroll=scroll.getScrollY();rows.removeAllViews();
        if(entries.isEmpty()){
            TextView empty=FeatureSheets.text(section.getContext(),"Songs appear here after you play another track.",14);empty.setPadding(0,dp(8),0,dp(8));rows.addView(empty);
        }else{
            for(int i=0;i<Math.min(entries.size(),visibleLimit);i++)addRow(entries.get(i).track);
            if(entries.size()>visibleLimit)rows.addView(FeatureSheets.button(section.getContext(),"Show older played songs",()->{visibleLimit+=20;render();}));
        }
        ViewGroup.LayoutParams size=scroll.getLayoutParams();size.height=dp(Math.max(1,Math.min(entries.size(),3))*64);scroll.setLayoutParams(size);
        scroll.post(()->scroll.scrollTo(0,previousScroll));
    }
    private void addRow(BookmarkCollection.Item track){
        Context context=section.getContext();LinearLayout row=new LinearLayout(context);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,dp(4),0,dp(4));
        ImageView cover=new ImageView(context);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setImageResource(android.R.drawable.ic_menu_gallery);cover.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        row.addView(cover,new LinearLayout.LayoutParams(dp(48),dp(48)));
        LinearLayout text=FeatureSheets.column(context);text.setPadding(dp(12),0,dp(8),0);
        TextView title=FeatureSheets.text(context,track.title,16);title.setSingleLine(true);title.setEllipsize(TextUtils.TruncateAt.END);text.addView(title);
        TextView artist=FeatureSheets.text(context,track.artist,13);artist.setTextColor(0xffbec1c9);artist.setSingleLine(true);artist.setEllipsize(TextUtils.TruncateAt.END);text.addView(artist);
        row.addView(text,new LinearLayout.LayoutParams(0,-2,1));
        TextView played=FeatureSheets.text(context,"↶",22);played.setTextColor(0xffbec1c9);row.addView(played);
        row.setContentDescription("Previously played: "+track.title+", "+track.artist);row.setOnClickListener(v->FeatureSheets.openSpotify(track.uri));
        rows.addView(row,new LinearLayout.LayoutParams(-1,dp(64)));loadCover(cover,track.artwork);
    }
    private static void loadCover(ImageView view,String source){
        String url=ArtworkSource.url(source);if(url==null)return;view.setTag(url);
        Bitmap cached=covers.get(url);if(cached!=null){view.setImageBitmap(cached);return;}
        WeakReference<ImageView> target=new WeakReference<>(view);
        images.execute(()->{
            HttpURLConnection connection=null;
            try{
                Bitmap image=covers.get(url);
                if(image==null){connection=(HttpURLConnection)new URL(url).openConnection();connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
                    BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=4;
                    try(java.io.InputStream input=connection.getInputStream()){image=BitmapFactory.decodeStream(input,null,options);}
                    if(image==null)return;covers.put(url,image);
                }
                Bitmap result=image;main.post(()->{ImageView current=target.get();if(current!=null&&url.equals(current.getTag()))current.setImageBitmap(result);});
            }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
        });
    }
}
