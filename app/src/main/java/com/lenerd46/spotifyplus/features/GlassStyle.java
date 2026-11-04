package com.lenerd46.spotifyplus.features;

import android.app.Activity;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import com.lenerd46.spotifyplus.References;
import java.lang.ref.WeakReference;
import java.util.*;

/** Optional native glass surfaces, inspired by LeNerd46/liquid-glass-spotify-plus. */
public final class GlassStyle {
    private static SharedPreferences prefs;
    private static final Map<View,Saved> changed=new WeakHashMap<>();
    private static final class Saved {
        final Drawable.ConstantState state;final WeakReference<Drawable> original;final boolean empty; final int left,top,right,bottom;
        Saved(View view){Drawable bg=view.getBackground();state=bg==null?null:bg.getConstantState();original=new WeakReference<>(bg);empty=bg==null;left=view.getPaddingLeft();top=view.getPaddingTop();right=view.getPaddingRight();bottom=view.getPaddingBottom();}
        Drawable restore(View v){return state!=null?state.newDrawable(v.getResources()):original.get();}
    }
    private GlassStyle(){}
    public static void initialize(Context context){prefs=context.getSharedPreferences("SpotifyPlusGlass",Context.MODE_PRIVATE);}
    public static void apply(View view){
        if(prefs==null)return;
        String resource="";try{if(view.getId()!=View.NO_ID)resource=view.getResources().getResourceEntryName(view.getId());}catch(Exception ignored){}
        String category=GlassTargets.category(view.getClass().getName(),resource,view.isClickable());
        boolean enabled=category!=null&&prefs.getBoolean("enabled",false)&&prefs.getBoolean(category,true);
        Saved old=changed.get(view);
        if(!enabled){if(old!=null){view.setBackground(old.empty?null:old.restore(view));view.setPadding(old.left,old.top,old.right,old.bottom);changed.remove(view);}return;}
        if(old==null){old=new Saved(view);if(!old.empty&&old.state==null)return;changed.put(view,old);}
        float radius=FeatureSheets.dp(view.getContext(),category.equals("headers")?8:22);
        view.setBackground(new Surface(radius,prefs.getInt("intensity",50)));
        view.setPadding(old.left,old.top,old.right,old.bottom);
    }
    public static void refresh(){
        Activity a=References.currentActivity;if(a==null)return;
        a.runOnUiThread(()->{
            for(View v:new ArrayList<>(changed.keySet()))if(v!=null)apply(v);
            visit(a.getWindow().getDecorView());
        });
    }
    private static void visit(View v){apply(v);if(v instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++)visit(group.getChildAt(i));}
    public static void show(){
        Activity a=References.currentActivity;if(a==null||prefs==null)return;
        a.runOnUiThread(()->FeatureSheets.show("Liquid Glass",root->{
            TextView detail=FeatureSheets.text(a,"Soft translucent surfaces and bright edges on Spotify’s existing controls. Your music and navigation stay in their native screens.",15);root.addView(detail);
            addSwitch(a,root,"Enable glass styling","enabled",false);
            addSwitch(a,root,"Headers and toolbars","headers",true);
            addSwitch(a,root,"Mini-player and navigation","player",true);
            addSwitch(a,root,"Menus and drawer surfaces","menus",true);
            addSwitch(a,root,"Cards and settings rows","cards",true);
            TextView label=FeatureSheets.text(a,"Glass intensity",16);label.setPadding(0,FeatureSheets.dp(a,20),0,0);root.addView(label);
            SeekBar intensity=new SeekBar(a);intensity.setMax(100);intensity.setProgress(prefs.getInt("intensity",50));root.addView(intensity);
            intensity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
                public void onProgressChanged(SeekBar s,int value,boolean user){}
                public void onStartTrackingTouch(SeekBar s){}
                public void onStopTrackingTouch(SeekBar s){prefs.edit().putInt("intensity",s.getProgress()).apply();refresh();}
            });
            TextView note=FeatureSheets.text(a,"Switch off to restore the previous surfaces. Styling applies to native views exposed by this Spotify build; Compose-only panels keep their existing appearance. No animation is added.",13);root.addView(note);
        }));
    }
    private static void addSwitch(Activity a,LinearLayout root,String title,String key,boolean fallback){
        Switch toggle=new Switch(a);toggle.setText(title);toggle.setTextColor(Color.WHITE);toggle.setPadding(0,FeatureSheets.dp(a,16),0,FeatureSheets.dp(a,16));toggle.setChecked(prefs.getBoolean(key,fallback));root.addView(toggle);
        toggle.setOnCheckedChangeListener((v,on)->{prefs.edit().putBoolean(key,on).apply();refresh();});
    }
    private static final class Surface extends Drawable {
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);final float radius;final int intensity;int alpha=255;
        Surface(float radius,int intensity){this.radius=radius;this.intensity=Math.max(0,Math.min(100,intensity));}
        public void draw(Canvas c){
            Rect b=getBounds();RectF r=new RectF(b.left+.7f,b.top+.7f,b.right-.7f,b.bottom-.7f);
            paint.setStyle(Paint.Style.FILL);paint.setShader(null);paint.setColor(0xe01a202c);paint.setAlpha(alpha*224/255);c.drawRoundRect(r,radius,radius,paint);
            int tint=28+intensity/2;
            paint.setAlpha(alpha);paint.setShader(new LinearGradient(r.left,r.top,r.right,r.bottom,new int[]{Color.argb(tint,196,181,253),Color.argb(tint/2,228,246,250),Color.argb(tint,124,230,171)},null,Shader.TileMode.CLAMP));c.drawRoundRect(r,radius,radius,paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.2f);paint.setShader(new LinearGradient(r.left,r.top,r.right,r.bottom,new int[]{0x8fffffff,0x15ffffff,0x55ffffff},null,Shader.TileMode.CLAMP));c.drawRoundRect(r,radius,radius,paint);paint.setShader(null);
        }
        public void setAlpha(int a){alpha=a;invalidateSelf();}public int getOpacity(){return PixelFormat.TRANSLUCENT;}public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    }
}
