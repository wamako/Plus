package com.lenerd46.spotifyplus.features;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.lang.reflect.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Executes the production software-capture and glass drawable on real Android. */
@RunWith(AndroidJUnit4.class)
public class GlassRenderingTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void excludesForegroundAcrossRepeatedCapturesAndRendersReadableGlass() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            try {
                FrameLayout root=new FrameLayout(context);root.setBackgroundColor(Color.rgb(22,45,65));
                FrameLayout foreground=new FrameLayout(context);foreground.setBackgroundColor(Color.MAGENTA);
                TextView label=new TextView(context);label.setText("Spotify Plus · rendering fixture");label.setTextColor(Color.WHITE);label.setTextSize(22);
                foreground.addView(label,new FrameLayout.LayoutParams(-1,-2));root.addView(foreground,new FrameLayout.LayoutParams(-1,-1));
                root.measure(View.MeasureSpec.makeMeasureSpec(600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(240,View.MeasureSpec.EXACTLY));root.layout(0,0,600,240);
                foreground.setAlpha(.85f);
                Class<?> type=Class.forName("com.lenerd46.spotifyplus.features.GlassStyle$Surface");
                Constructor<?> constructor=type.getDeclaredConstructor(View.class,float.class,int.class);constructor.setAccessible(true);
                Drawable surface=(Drawable)constructor.newInstance(foreground,60f,50);
                Field backdrop=type.getDeclaredField("backdrop"),captured=type.getDeclaredField("captured");backdrop.setAccessible(true);captured.setAccessible(true);
                for(int attempt=0;attempt<6;attempt++) {
                    Bitmap image=GlassBackdrop.capture(foreground);assertNotNull(image);
                    // A foreground magenta card/white text must never feed its
                    // own next capture, even after the real glass is installed.
                    for(int y=0;y<image.getHeight();y++)for(int x=0;x<image.getWidth();x++) {
                        int pixel=image.getPixel(x,y);assertTrue(Color.red(pixel)<40);assertTrue(Color.green(pixel)>25);assertTrue(Color.blue(pixel)>45);
                    }
                    assertEquals(View.VISIBLE,foreground.getVisibility());assertEquals(.85f,foreground.getAlpha(),0f);assertFalse(GlassBackdrop.isCapturing());
                    Bitmap old=(Bitmap)backdrop.get(surface);backdrop.set(surface,image);if(old!=null)old.recycle();
                    captured.setLong(surface,SystemClock.uptimeMillis());foreground.setBackground(surface);
                }
                Bitmap rendered=Bitmap.createBitmap(600,240,Bitmap.Config.ARGB_8888);root.draw(new Canvas(rendered));
                int bright=0;for(int y=0;y<100;y++)for(int x=0;x<600;x++){int pixel=rendered.getPixel(x,y);if(Color.red(pixel)>170&&Color.green(pixel)>170&&Color.blue(pixel)>170)bright++;}
                assertTrue("The foreground label must remain sharp/visible",bright>200);
                File output=new File(context.getExternalFilesDir(null),"glass-fixture.png");
                try(FileOutputStream file=new FileOutputStream(output)){assertTrue(rendered.compress(Bitmap.CompressFormat.PNG,100,file));}
                rendered.recycle();
            } catch(Exception error){throw new AssertionError(error);}
        });
    }
    @Test public void appliesBlurRatherThanPixelatedDownsampling() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            FrameLayout root=new FrameLayout(context);
            root.setBackground(new Drawable(){public void draw(Canvas canvas){Paint paint=new Paint();for(int x=0;x<320;x+=8){paint.setColor(x%16==0?Color.WHITE:Color.BLACK);canvas.drawRect(x,0,x+8,160,paint);}}public void setAlpha(int alpha){}public void setColorFilter(ColorFilter filter){}public int getOpacity(){return PixelFormat.OPAQUE;}});
            View foreground=new View(context);foreground.setBackgroundColor(Color.MAGENTA);root.addView(foreground,new FrameLayout.LayoutParams(-1,-1));
            root.measure(View.MeasureSpec.makeMeasureSpec(320,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(160,View.MeasureSpec.EXACTLY));root.layout(0,0,320,160);
            Bitmap image=GlassBackdrop.capture(foreground);assertNotNull(image);
            for(int x=8;x<image.getWidth()-8;x++){int red=Color.red(image.getPixel(x,10));assertTrue(red>70&&red<185);}
            image.recycle();
        });
    }
    @Test public void failedCaptureRestoresVisibilityAndCaptureState() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            FrameLayout root=new FrameLayout(context);root.setBackground(new Drawable(){public void draw(Canvas c){throw new IllegalStateException("fixture");}public void setAlpha(int a){}public void setColorFilter(ColorFilter f){}public int getOpacity(){return PixelFormat.OPAQUE;}});
            View foreground=new View(context);foreground.setAlpha(.6f);root.addView(foreground,new FrameLayout.LayoutParams(-1,-1));root.measure(View.MeasureSpec.makeMeasureSpec(100,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(100,View.MeasureSpec.EXACTLY));root.layout(0,0,100,100);
            assertNull(GlassBackdrop.capture(foreground));assertEquals(View.VISIBLE,foreground.getVisibility());assertEquals(.6f,foreground.getAlpha(),0f);assertFalse(GlassBackdrop.isCapturing());
        });
    }
}
