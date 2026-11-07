package com.lenerd46.spotifyplus.features;

import android.graphics.*;
import android.os.Looper;
import android.view.View;

/** Software backdrop capture with the whole foreground subtree excluded. */
public final class GlassBackdrop {
    private static boolean capturing;
    private GlassBackdrop() {}
    public static boolean isCapturing(){return capturing;}
    public static Bitmap capture(View view) {
        if(Looper.myLooper()!=Looper.getMainLooper()) throw new IllegalStateException("Capture must run on main");
        if(capturing||view==view.getRootView()||view.getWidth()<1||view.getHeight()<1)return null;
        int visibility=view.getVisibility();Bitmap image=null;
        capturing=true;
        try {
            image=Bitmap.createBitmap(Math.max(1,(view.getWidth()+7)/8),Math.max(1,(view.getHeight()+7)/8),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(image);int[] root=new int[2],target=new int[2];
            view.getRootView().getLocationOnScreen(root);view.getLocationOnScreen(target);
            canvas.scale(image.getWidth()/(float)view.getWidth(),image.getHeight()/(float)view.getHeight());
            canvas.translate(root[0]-target[0],root[1]-target[1]);
            // Alpha is a render-node property and is not a reliable exclusion
            // when the root is drawn into a software Canvas. INVISIBLE skips
            // the subtree in dispatchDraw, without changing layout geometry.
            view.setVisibility(View.INVISIBLE);
            view.getRootView().draw(canvas);
            blur(image);
            return image;
        } catch(RuntimeException error) {
            if(image!=null)image.recycle();return null;
        } finally {
            view.setVisibility(visibility);capturing=false;
        }
    }
    private static void blur(Bitmap image) {
        int w=image.getWidth(),h=image.getHeight();int[] a=new int[w*h],b=new int[w*h];image.getPixels(a,0,w,0,0,w,h);
        // Three separable box passes approximate a Gaussian; downsampling alone
        // left readable, pixelated text in the drawer and navigation background.
        for(int pass=0;pass<3;pass++) {
            for(int y=0;y<h;y++)for(int x=0;x<w;x++)b[y*w+x]=average(a,w,h,x,y,true);
            for(int y=0;y<h;y++)for(int x=0;x<w;x++)a[y*w+x]=average(b,w,h,x,y,false);
        }
        image.setPixels(a,0,w,0,0,w,h);
    }
    private static int average(int[] pixels,int w,int h,int x,int y,boolean horizontal) {
        int a=0,r=0,g=0,b=0;
        for(int d=-3;d<=3;d++) {
            int p=pixels[Math.max(0,Math.min(h-1,y+(horizontal?0:d)))*w+Math.max(0,Math.min(w-1,x+(horizontal?d:0)))];
            a+=Color.alpha(p);r+=Color.red(p);g+=Color.green(p);b+=Color.blue(p);
        }
        return Color.argb(a/7,r/7,g/7,b/7);
    }
}
