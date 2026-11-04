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
    public static int dp(Context c,int value){return Math.round(value*c.getResources().getDisplayMetrics().density);}
    public static TextView text(Context c,String label,int size){TextView t=new TextView(c);t.setText(label);t.setTextSize(size);t.setTextColor(Color.WHITE);return t;}
    public static Button button(Context c,String label,Runnable action){Button b=new Button(c);b.setText(label);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setOnClickListener(v->action.run());return b;}
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
        content.accept(root);dialog.setContentView(root);dialog.show();current=new java.lang.ref.WeakReference<>(dialog);
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
