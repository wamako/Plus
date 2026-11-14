package com.lenerd46.spotifyplus.features;

import android.graphics.*;
import android.os.Looper;
import android.view.View;

/** Software backdrop capture with the whole foreground subtree excluded. */
public final class GlassBackdrop {
    private static boolean capturing;
    private static final int[] ROOT_LOC = new int[2];
    private static final int[] TARGET_LOC = new int[2];
    private static int[] blurBufA = new int[0];
    private static int[] blurBufB = new int[0];
    private GlassBackdrop() {}
    public static boolean isCapturing(){return capturing;}
    public static Bitmap capture(View view) {
        if(Looper.myLooper()!=Looper.getMainLooper()) throw new IllegalStateException("Capture must run on main");
        if(capturing||view==view.getRootView()||view.getWidth()<1||view.getHeight()<1)return null;
        int visibility=view.getVisibility();Bitmap image=null;
        capturing=true;
        try {
            image=Bitmap.createBitmap(Math.max(1,(view.getWidth()+7)/8),Math.max(1,(view.getHeight()+7)/8),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(image);
            view.getRootView().getLocationOnScreen(ROOT_LOC);view.getLocationOnScreen(TARGET_LOC);
            canvas.scale(image.getWidth()/(float)view.getWidth(),image.getHeight()/(float)view.getHeight());
            canvas.translate(ROOT_LOC[0]-TARGET_LOC[0],ROOT_LOC[1]-TARGET_LOC[1]);
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
        int w=image.getWidth(),h=image.getHeight(),size=w*h;
        if(blurBufA.length<size){
            blurBufA=new int[size];
            blurBufB=new int[size];
        }
        int[] a=blurBufA,b=blurBufB;
        image.getPixels(a,0,w,0,0,w,h);
        // Three separable box passes approximate a Gaussian; downsampling alone
        // left readable, pixelated text in the drawer and navigation background.
        for(int pass=0;pass<3;pass++) {
            for(int y=0;y<h;y++){
                int row=y*w;
                for(int x=0;x<w;x++)b[row+x]=averageHorizontal(a,row,w,x);
            }
            for(int y=0;y<h;y++){
                int row=y*w;
                for(int x=0;x<w;x++)a[row+x]=averageVertical(b,w,h,x,y);
            }
        }
        image.setPixels(a,0,w,0,0,w,h);
    }
    private static int averageHorizontal(int[] pixels,int row,int w,int x) {
        int a=0,r=0,g=0,b=0,maxX=w-1;
        for(int d=-3;d<=3;d++) {
            int cx=x+d;
            if(cx<0)cx=0;else if(cx>maxX)cx=maxX;
            int p=pixels[row+cx];
            a+=(p>>>24);r+=(p>>16)&0xFF;g+=(p>>8)&0xFF;b+=p&0xFF;
        }
        return ((a/7)<<24)|((r/7)<<16)|((g/7)<<8)|(b/7);
    }
    private static int averageVertical(int[] pixels,int w,int h,int x,int y) {
        int a=0,r=0,g=0,b=0,maxY=h-1;
        for(int d=-3;d<=3;d++) {
            int cy=y+d;
            if(cy<0)cy=0;else if(cy>maxY)cy=maxY;
            int p=pixels[cy*w+x];
            a+=(p>>>24);r+=(p>>16)&0xFF;g+=(p>>8)&0xFF;b+=p&0xFF;
        }
        return ((a/7)<<24)|((r/7)<<16)|((g/7)<<8)|(b/7);
    }
}
