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
    private static final Map<Integer,String> resourceNameCache=new java.util.concurrent.ConcurrentHashMap<>();
    private static final class Saved {
        final ViewGroup.LayoutParams layout; final int marginLeft,marginRight,marginBottom;final android.content.res.ColorStateList tint;
        final Drawable.ConstantState state;final Drawable original;final boolean empty; final int left,top,right,bottom;
        Saved(View view){tint=view.getBackgroundTintList();layout=view.getLayoutParams();marginBottom=layout instanceof ViewGroup.MarginLayoutParams m?m.bottomMargin:0;marginLeft=layout instanceof ViewGroup.MarginLayoutParams m?m.leftMargin:0;marginRight=layout instanceof ViewGroup.MarginLayoutParams m?m.rightMargin:0;Drawable bg=view.getBackground();state=bg==null?null:bg.getConstantState();original=bg;empty=bg==null;left=view.getPaddingLeft();top=view.getPaddingTop();right=view.getPaddingRight();bottom=view.getPaddingBottom();}
        Drawable restore(View v){return state!=null?state.newDrawable(v.getResources()):original;}
    }
    private GlassStyle(){}
    public static void initialize(Context context){prefs=context.getSharedPreferences("SpotifyPlusGlass",Context.MODE_PRIVATE);}
    public static void apply(View view){
        if(prefs==null)return;
        boolean globalEnabled=prefs.getBoolean("enabled",false);
        boolean animatedBg=com.lenerd46.spotifyplus.hooks.ThemeHook.usesAnimatedBackground();
        if(!globalEnabled&&!animatedBg&&changed.isEmpty())return;
        String resource="";
        int id=view.getId();
        if(id!=View.NO_ID){
            String cached=resourceNameCache.get(id);
            if(cached!=null){
                resource=cached;
            }else{
                try{resource=view.getResources().getResourceEntryName(id);}catch(Exception ignored){resource="";}
                resourceNameCache.put(id,resource);
            }
        }
        String className=view.getClass().getName();
        String category=GlassTargets.category(className,resource,view.isClickable());
        boolean enabled=category!=null&&globalEnabled&&prefs.getBoolean(category,true);
        if(className.toLowerCase(java.util.Locale.ROOT).endsWith("appbarlayout"))HeaderLayers.apply(view,enabled||animatedBg);
        Saved old=changed.get(view);
        if(!enabled){if(old!=null){view.setBackground(old.empty?null:old.restore(view));view.setPadding(old.left,old.top,old.right,old.bottom);view.setBackgroundTintList(old.tint);if(view.getLayoutParams() instanceof ViewGroup.MarginLayoutParams m){m.leftMargin=old.marginLeft;m.rightMargin=old.marginRight;m.bottomMargin=old.marginBottom;view.setLayoutParams(m);}changed.remove(view);}return;}
        if(old==null){old=new Saved(view);changed.put(view,old);}
        if (isNavigation(resource) && view.getLayoutParams() instanceof ViewGroup.MarginLayoutParams m) {
            m.leftMargin=old.marginLeft+FeatureSheets.dp(view.getContext(),12);
            m.rightMargin=old.marginRight+FeatureSheets.dp(view.getContext(),12);
            android.view.WindowInsets insets=view.getRootWindowInsets();
            int systemBottom=insets==null?0:insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
            int bottom=old.marginBottom+systemBottom+FeatureSheets.dp(view.getContext(),8);
            if(m.bottomMargin!=bottom){m.bottomMargin=bottom;view.setLayoutParams(m);}
        }
        view.setBackgroundTintList(null);
        if(view.getBackground() instanceof Surface surface && surface.intensity==prefs.getInt("intensity",50))return;
        float radius=FeatureSheets.dp(view.getContext(),category.equals("headers")?20:40);
        int left=view.getPaddingLeft(),top=view.getPaddingTop(),right=view.getPaddingRight(),bottom=view.getPaddingBottom();
        view.setBackground(new Surface(view,radius,prefs.getInt("intensity",50)));
        view.setPadding(left,top,right,bottom);
    }
    private static boolean isNavigation(String resource){return resource.contains("bottom_navigation")||resource.equals("navigation_bar")||resource.equals("bottom_nav");}
    public static void observe(Activity activity){
        View root=activity.getWindow().getDecorView();
        if(root.getTag(0x5350474c)!=null)return;
        root.setTag(0x5350474c,Boolean.TRUE);
        root.post(new Runnable(){boolean previouslyActive;public void run(){
            if(activity.isDestroyed())return;
            boolean active=prefs!=null&&(prefs.getBoolean("enabled",false)||com.lenerd46.spotifyplus.hooks.ThemeHook.usesAnimatedBackground());
            // Reconcile once when turning off, then avoid repeated tree scans.
            if(root.isAttachedToWindow()&&activity.hasWindowFocus()) {
                if(active||previouslyActive||!changed.isEmpty())visit(root);
                previouslyActive=active;
            }
            root.postDelayed(this,500);
        }});
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
            TextView detail=FeatureSheets.text(a,"Floating pill surfaces, frosted backgrounds and bright glass edges. Your existing Spotify navigation stays interactive.",15);root.addView(detail);
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
            TextView note=FeatureSheets.text(a,"Changes apply immediately to supported native controls. Switch off to restore the original surfaces.",13);root.addView(note);
        }));
    }
    private static void addSwitch(Activity a,LinearLayout root,String title,String key,boolean fallback){
        LinearLayout row=new LinearLayout(a);row.setGravity(Gravity.CENTER_VERTICAL);
        TextView label=FeatureSheets.text(a,title,17);row.addView(label,new LinearLayout.LayoutParams(0,FeatureSheets.dp(a,64),1));
        TextView toggle=FeatureSheets.text(a,"",15);toggle.setGravity(Gravity.CENTER);toggle.setTypeface(null,1);
        row.addView(toggle,new LinearLayout.LayoutParams(FeatureSheets.dp(a,76),FeatureSheets.dp(a,44)));root.addView(row);
        Runnable update=()->{
            boolean on=prefs.getBoolean(key,fallback);toggle.setText(on?"ON":"OFF");
            GradientDrawable bg=new GradientDrawable();bg.setColor(on?0xff1c7c61:0xff434957);bg.setCornerRadius(FeatureSheets.dp(a,24));bg.setStroke(FeatureSheets.dp(a,1),on?0xff90eac8:0xff8b92a3);toggle.setBackground(bg);
            row.setContentDescription(title+(on?", on":", off"));toggle.setContentDescription(title+(on?", on":", off"));
        };
        View.OnClickListener click=v->{prefs.edit().putBoolean(key,!prefs.getBoolean(key,fallback)).apply();update.run();refresh();};
        row.setOnClickListener(click);toggle.setOnClickListener(click);update.run();
    }

    private static final class Surface extends Drawable {
        final WeakReference<View> owner; Bitmap backdrop;long captured;boolean capturing,pending;
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);final float radius;final int intensity;int alpha=255;
        final RectF drawRect=new RectF();
        final Path clipPath=new Path();
        int cachedLeft=Integer.MIN_VALUE,cachedTop=Integer.MIN_VALUE,cachedRight=Integer.MIN_VALUE,cachedBottom=Integer.MIN_VALUE;
        LinearGradient fillShader,strokeShader;
        Surface(View view,float radius,int intensity){owner=new WeakReference<>(view);this.radius=radius;this.intensity=Math.max(0,Math.min(100,intensity));}
        public void draw(Canvas c){
            View v=owner.get();
            if(v!=null&&v.isAttachedToWindow()&&v.hasWindowFocus()&&v.isShown()&&!pending&&!capturing&&!GlassBackdrop.isCapturing()&&android.os.SystemClock.uptimeMillis()-captured>250){
                captured=android.os.SystemClock.uptimeMillis();pending=true;
                if(!v.post(()->{pending=false;capture(v);}))pending=false;
            }
            Rect b=getBounds();
            if(b.left!=cachedLeft||b.top!=cachedTop||b.right!=cachedRight||b.bottom!=cachedBottom||fillShader==null||strokeShader==null){
                cachedLeft=b.left;cachedTop=b.top;cachedRight=b.right;cachedBottom=b.bottom;
                drawRect.set(b.left+.7f,b.top+.7f,b.right-.7f,b.bottom-.7f);
                clipPath.reset();
                clipPath.addRoundRect(drawRect,radius,radius,Path.Direction.CW);
                int tint=28+intensity/2;
                fillShader=new LinearGradient(drawRect.left,drawRect.top,drawRect.right,drawRect.bottom,new int[]{Color.argb(tint,196,181,253),Color.argb(tint/2,228,246,250),Color.argb(tint,124,230,171)},null,Shader.TileMode.CLAMP);
                strokeShader=new LinearGradient(drawRect.left,drawRect.top,drawRect.right,drawRect.bottom,new int[]{0x8fffffff,0x15ffffff,0x55ffffff},null,Shader.TileMode.CLAMP);
            }
            paint.setStyle(Paint.Style.FILL);paint.setShader(null);
            int save=c.save();c.clipPath(clipPath);
            if(backdrop!=null){paint.setAlpha(alpha);paint.setFilterBitmap(true);c.drawBitmap(backdrop,null,drawRect,paint);}
            paint.setColor(0xffa8adb5);paint.setAlpha(alpha*(65+intensity/2)/255);c.drawRoundRect(drawRect,radius,radius,paint);c.restoreToCount(save);
            paint.setAlpha(alpha);paint.setShader(fillShader);c.drawRoundRect(drawRect,radius,radius,paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(3f);paint.setShader(strokeShader);c.drawRoundRect(drawRect,radius,radius,paint);paint.setShader(null);
        }
        private void capture(View view){
            if(capturing||!view.isAttachedToWindow()||!view.hasWindowFocus()||!view.isShown()||view.getBackground()!=this||view.getWidth()==0||view.getHeight()==0)return;
            capturing=true;
            try{
                Bitmap image=GlassBackdrop.capture(view);
                if(image!=null){Bitmap old=backdrop;backdrop=image;if(old!=null)old.recycle();}
            }finally{capturing=false;}
            invalidateSelf();
        }
        public void setAlpha(int a){alpha=a;invalidateSelf();}public int getOpacity(){return PixelFormat.TRANSLUCENT;}public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    }
}
