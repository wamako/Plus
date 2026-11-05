package com.lenerd46.spotifyplus.features;
import android.view.*;
/** Keep the interactive Home row below status/cutout icons, including when its spacer collapses. */
public final class HomeHeaderInsets {
    private static final int TAG=0x53504869;
    private HomeHeaderInsets(){}
    public static void observe(View appBar){if(appBar.getTag(TAG)!=null)return;appBar.setTag(TAG,new Binding(appBar));}
    private static final class Binding implements ViewTreeObserver.OnPreDrawListener,View.OnAttachStateChangeListener {
        final View bar;final int originalMargin;boolean observing;
        Binding(View bar){this.bar=bar;originalMargin=bar.getLayoutParams() instanceof ViewGroup.MarginLayoutParams p?p.topMargin:0;bar.addOnAttachStateChangeListener(this);if(bar.isAttachedToWindow())attach();}
        void attach(){if(!observing&&bar.getViewTreeObserver().isAlive()){bar.getViewTreeObserver().addOnPreDrawListener(this);observing=true;}}
        public void onViewAttachedToWindow(View view){attach();}
        public void onViewDetachedFromWindow(View view){if(bar.getViewTreeObserver().isAlive())bar.getViewTreeObserver().removeOnPreDrawListener(this);observing=false;}
        public boolean onPreDraw(){
            if(!bar.isShown()||!(bar.getLayoutParams() instanceof ViewGroup.MarginLayoutParams params))return true;
            WindowInsets insets=bar.getRootWindowInsets();if(insets==null)return true;
            int id=bar.getResources().getIdentifier("filters_container","id","com.spotify.music");
            View controls=id==0?null:bar.findViewById(id);if(controls==null||controls.getHeight()==0)return true;
            int[] point=new int[2],window=new int[2];controls.getLocationOnScreen(point);bar.getRootView().getLocationOnScreen(window);
            int safe=window[1]+insets.getInsets(WindowInsets.Type.statusBars()|WindowInsets.Type.displayCutout()).top+FeatureSheets.dp(bar.getContext(),4);
            int margin=HeaderInsetPosition.topMargin(originalMargin,params.topMargin,point[1],safe);
            if(params.topMargin==margin)return true;params.topMargin=margin;bar.setLayoutParams(params);return false;
        }
    }
}
