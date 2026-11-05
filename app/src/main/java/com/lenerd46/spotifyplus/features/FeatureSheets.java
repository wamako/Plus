package com.lenerd46.spotifyplus.features;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;
import com.lenerd46.spotifyplus.References;

public final class FeatureSheets {
    private static java.lang.ref.WeakReference<Dialog> current = new java.lang.ref.WeakReference<>(null);
    private FeatureSheets() {}
    public static void close(){Dialog dialog=current.get();if(dialog!=null)dialog.dismiss();}
    public static int dp(Context c,int value){return Math.round(value*c.getResources().getDisplayMetrics().density);}
    public static TextView text(Context c,String label,int size){TextView t=new TextView(c);t.setText(label);t.setTextSize(size);t.setTextColor(Color.WHITE);return t;}
    public static Button button(Context c,String label,Runnable action){
        Button b=new Button(c);b.setText(label);b.setAllCaps(false);b.setTextSize(14);b.setTypeface(android.graphics.Typeface.DEFAULT,1);
        b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(c,44));b.setMinimumHeight(dp(c,44));
        b.setPadding(dp(c,14),dp(c,8),dp(c,14),dp(c,8));b.setSingleLine(false);b.setMaxLines(2);b.setEllipsize(null);
        b.setTextColor(new android.content.res.ColorStateList(new int[][]{{-android.R.attr.state_enabled},{}},new int[]{0xff8e96a5,Color.WHITE}));
        GradientDrawable background=new GradientDrawable();background.setColor(0xff293142);background.setCornerRadius(dp(c,24));background.setStroke(dp(c,1),0xff727b91);
        b.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x33ffffff),background,null));
        b.setOnClickListener(v->action.run());return b;
    }
    public static void pillRow(LinearLayout root,LinearLayout row){
        HorizontalScrollView scroll=new HorizontalScrollView(root.getContext());scroll.setHorizontalScrollBarEnabled(false);scroll.setFillViewport(true);
        row.setPadding(0,dp(root.getContext(),4),0,dp(root.getContext(),4));scroll.addView(row);root.addView(scroll,new LinearLayout.LayoutParams(-1,-2));
    }

    public static LinearLayout column(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.VERTICAL);return v;}
    public static void toast(String message){Activity a=References.currentActivity;if(a!=null)a.runOnUiThread(()->Toast.makeText(a,message,Toast.LENGTH_LONG).show());}
    public static Dialog show(String title, java.util.function.Consumer<LinearLayout> content) {
        Activity a=References.currentActivity;
        if(a==null||a.isFinishing()||a.isDestroyed())return null;
        Dialog previous=current.get();if(previous!=null)previous.dismiss();
        Dialog dialog=new Dialog(a,android.R.style.Theme_DeviceDefault_NoActionBar);
        LinearLayout root=column(a);root.setPadding(dp(a,18),dp(a,14),dp(a,18),dp(a,18));
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xff292c43,0xff141923,0xff171f24}));
        LinearLayout header=new LinearLayout(a);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView heading=text(a,title,26);heading.setTypeface(null,1);
        header.addView(heading,new LinearLayout.LayoutParams(0,dp(a,64),1));
        header.addView(button(a,"Close",dialog::dismiss));root.addView(header);
        content.accept(root);
        ScrollView scroll=new ScrollView(a);scroll.setFillViewport(true);scroll.addView(root);scroll.setBackgroundColor(0xff171f24);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        dialog.setContentView(scroll);dialog.show();current=new java.lang.ref.WeakReference<>(dialog);
        dialog.setOnDismissListener(d->{if(current.get()==dialog)current.clear();});
        if(dialog.getWindow()!=null)dialog.getWindow().setLayout(-1,-1);
        return dialog;
    }
    public static void openSpotify(String uri){
        Activity a=References.currentActivity;if(a==null)return;
        try{Intent i=new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(BookmarkCollection.normalize(uri)));i.setPackage("com.spotify.music");Dialog dialog=current.get();if(dialog!=null)dialog.dismiss();a.startActivity(i);}
        catch(Exception e){toast("Could not open this bookmark");}
    }
}
