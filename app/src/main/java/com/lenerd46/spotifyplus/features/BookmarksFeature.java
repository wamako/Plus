package com.lenerd46.spotifyplus.features;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;
import com.lenerd46.spotifyplus.References;
import java.util.*;
import java.util.concurrent.*;
import java.net.*;
import java.io.*;

/** Native counterpart of LeNerd46/bookmarks for the legacy Spotify Plus runtime. */
public final class BookmarksFeature {
    private static BookmarkCollection store;
    private static final ExecutorService images=new ThreadPoolExecutor(0,2,20,TimeUnit.SECONDS,new ArrayBlockingQueue<>(24),new ThreadPoolExecutor.DiscardPolicy());
    private BookmarksFeature(){}
    public static synchronized BookmarkCollection store(){
        if(store==null){
            Activity a=References.currentActivity;if(a==null)throw new IllegalStateException("Spotify is not ready");
            SharedPreferences prefs=a.getSharedPreferences("SpotifyPlusBookmarks",Context.MODE_PRIVATE);
            store=new BookmarkCollection(new BookmarkCollection.Storage(){
                public String read(){return prefs.getString("items","[]");}
                public void write(String json){if(!prefs.edit().putString("items",json).commit())throw new IllegalStateException("Could not save bookmarks");}
            });
        }
        return store;
    }
    public static void add(String uri,String title,String artist,String artwork){
        try{boolean added=store().add(new BookmarkCollection.Item(uri,title,artist,artwork));FeatureSheets.toast(added?"Added to Bookmarks":"Already bookmarked");}
        catch(Exception e){FeatureSheets.toast("Could not save bookmark: "+e.getMessage());}
    }
    public static void show(){
        Activity a=References.currentActivity;if(a==null)return;
        a.runOnUiThread(()->{
            try{FeatureSheets.show("Bookmarks",root->new Page(a,root));}
            catch(Exception e){FeatureSheets.toast("Could not open Bookmarks: "+e.getMessage());}
        });
    }
    private static final class Page extends BaseAdapter {
        final Activity activity; final TextView counts,empty; final ListView list; final Button edit,undo;
        List<BookmarkCollection.Item> visible=List.of(); String filter="all"; boolean editing; BookmarkCollection.Removed removed;
        Page(Activity a,LinearLayout root){
            activity=a;counts=FeatureSheets.text(a,"",13);root.addView(counts);
            LinearLayout tools=new LinearLayout(a);edit=FeatureSheets.button(a,"Edit",()->{editing=!editing;if(editing)filter="all";reload();});
            tools.addView(edit,new LinearLayout.LayoutParams(0,-2,1));tools.addView(FeatureSheets.button(a,"Add link",this::addLink),new LinearLayout.LayoutParams(0,-2,1));
            undo=FeatureSheets.button(a,"Undo",()->{try{if(store().undo(removed)){removed=null;reload();}}catch(Exception e){FeatureSheets.toast("Could not restore bookmark");}});tools.addView(undo,new LinearLayout.LayoutParams(0,-2,1));root.addView(tools);
            LinearLayout filters=new LinearLayout(a);String[] types={"all","track","album","artist"},names={"All","Songs","Albums","Artists"};
            for(int i=0;i<types.length;i++){final String type=types[i];filters.addView(FeatureSheets.button(a,names[i],()->{if(editing){FeatureSheets.toast("Finish editing to filter bookmarks");return;}filter=type;reload();}),new LinearLayout.LayoutParams(0,-2,1));}root.addView(filters);
            empty=FeatureSheets.text(a,"",16);empty.setPadding(0,FeatureSheets.dp(a,24),0,0);root.addView(empty);
            list=new ListView(a);list.setDivider(null);list.setAdapter(this);root.addView(list,new LinearLayout.LayoutParams(-1,0,1));reload();
        }
        void reload(){
            try{
                visible=store().list(filter);List<BookmarkCollection.Item> all=store().list("all");
                counts.setText(all.size()+" saved · "+store().list("track").size()+" songs · "+store().list("album").size()+" albums · "+store().list("artist").size()+" artists");
                edit.setText(editing?"Done":"Edit");undo.setEnabled(removed!=null);
                empty.setText(all.isEmpty()?"Save a song, album or artist from its menu, or add a Spotify link.":"No bookmarks in this category.");empty.setVisibility(visible.isEmpty()?View.VISIBLE:View.GONE);notifyDataSetChanged();
            }catch(Exception e){FeatureSheets.toast(e.getMessage());}
        }
        void addLink(){
            LinearLayout fields=FeatureSheets.column(activity);int p=FeatureSheets.dp(activity,16);fields.setPadding(p,p,p,p);
            EditText uri=new EditText(activity);uri.setHint("Spotify link or URI");uri.setSingleLine(true);fields.addView(uri);
            EditText title=new EditText(activity);title.setHint("Name (optional)");fields.addView(title);
            AlertDialog d=new AlertDialog.Builder(activity).setTitle("Add bookmark").setView(fields).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();
            d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
                try{store().add(new BookmarkCollection.Item(uri.getText().toString(),title.getText().toString(),"",""));reload();d.dismiss();}
                catch(Exception e){uri.setError(e.getMessage());}
            }));d.show();
        }
        public int getCount(){return visible.size();}public Object getItem(int p){return visible.get(p);}public long getItemId(int p){return p;}
        public View getView(int position,View convert,ViewGroup parent){
            BookmarkCollection.Item item=visible.get(position);LinearLayout row=new LinearLayout(activity);row.setGravity(Gravity.CENTER_VERTICAL);int p=FeatureSheets.dp(activity,10);row.setPadding(p,p,p,p);
            GradientDrawable bg=new GradientDrawable();bg.setColor(0x332d3449);bg.setCornerRadius(FeatureSheets.dp(activity,14));row.setBackground(bg);
            ImageView art=new ImageView(activity);art.setScaleType(ImageView.ScaleType.CENTER_CROP);art.setContentDescription(item.type);art.setImageResource(android.R.drawable.ic_media_play);row.addView(art,new LinearLayout.LayoutParams(FeatureSheets.dp(activity,46),FeatureSheets.dp(activity,46)));loadArtwork(art,item.artwork);
            LinearLayout labels=FeatureSheets.column(activity);labels.setPadding(p,0,p,0);TextView name=FeatureSheets.text(activity,item.title,16);name.setMaxLines(2);labels.addView(name);TextView subtitle=FeatureSheets.text(activity,item.artist.isBlank()?item.type:item.artist+" · "+item.type,12);subtitle.setTextColor(0xffbec5d3);labels.addView(subtitle);row.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
            if(editing){
                row.addView(small("↑",()->{store().move(item.uri,-1);reload();}));row.addView(small("↓",()->{store().move(item.uri,1);reload();}));row.addView(small("×",()->{removed=store().remove(item.uri);reload();}));
            }else row.setOnClickListener(v->FeatureSheets.openSpotify(item.uri));
            return row;
        }
        Button small(String label,Runnable r){Button b=FeatureSheets.button(activity,label,()->{try{r.run();}catch(Exception e){FeatureSheets.toast("Could not save bookmarks");}});b.setContentDescription(label.equals("↑")?"Move bookmark up":label.equals("↓")?"Move bookmark down":"Remove bookmark");b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(0,0,0,0);b.setLayoutParams(new LinearLayout.LayoutParams(FeatureSheets.dp(activity,44),FeatureSheets.dp(activity,48)));return b;}
    }
    private static void loadArtwork(ImageView image,String value){
        String url=value==null?"":value;
        if(url.startsWith("spotify:image:"))url="https://i.scdn.co/image/"+url.substring(14);
        if(!url.startsWith("https://i.scdn.co/image/"))return;
        final String source=url;image.setTag(source);
        images.execute(()->{
            HttpURLConnection connection=null;
            try{
                connection=(HttpURLConnection)new URL(source).openConnection();connection.setConnectTimeout(5000);connection.setReadTimeout(5000);connection.setInstanceFollowRedirects(false);
                if(connection.getResponseCode()!=200)return;
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>2_000_000)return;bytes.write(buffer,0,n);}}
                byte[] data=bytes.toByteArray();BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,bounds);
                int sample=1;while(bounds.outWidth/sample>256||bounds.outHeight/sample>256)sample*=2;
                BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=sample;Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length,options);
                image.post(()->{if(source.equals(image.getTag())&&bitmap!=null)image.setImageBitmap(bitmap);});
            }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
        });
    }
}
