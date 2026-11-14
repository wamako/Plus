package com.lenerd46.spotifyplus;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.widget.FrameLayout;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.lenerd46.spotifyplus.beautifullyrics.entities.GradientTextView;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SmoothnessAndroidTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test
    public void gradientTextViewReusesShaderAcrossProgressFramesAndFastPathsEndpoints() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                GradientTextView tv = new GradientTextView(context);
                tv.setText("Spotify Plus Smooth Lyrics");
                tv.setTextSize(20f);
                tv.setGradientColors(new int[]{Color.WHITE, Color.GRAY});
                tv.measure(
                        View.MeasureSpec.makeMeasureSpec(500, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(100, View.MeasureSpec.EXACTLY)
                );
                tv.layout(0, 0, 500, 100);

                Bitmap bitmap = Bitmap.createBitmap(500, 100, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);

                Field activeShaderField = GradientTextView.class.getDeclaredField("activeShader");
                activeShaderField.setAccessible(true);

                // Endpoint progress 0 uses solid color fast path (setProgress takes 0..100%)
                tv.setProgress(0f);
                tv.draw(canvas);
                assertNull("Paint shader must be null at progress=0f", tv.getPaint().getShader());

                // Midpoint progress uses the cached unit LinearGradient transformed via Matrix
                tv.setProgress(25f);
                tv.draw(canvas);
                LinearGradient shaderAt25 = (LinearGradient) activeShaderField.get(tv);
                assertNotNull(shaderAt25);
                assertSame(shaderAt25, tv.getPaint().getShader());

                tv.setProgress(75f);
                tv.draw(canvas);
                LinearGradient shaderAt75 = (LinearGradient) activeShaderField.get(tv);
                assertSame("GradientTextView must reuse the same LinearGradient across progress frames", shaderAt25, shaderAt75);

                // Endpoint progress 100 uses solid color fast path
                tv.setProgress(100f);
                tv.draw(canvas);
                assertNull("Paint shader must be null at progress=100f", tv.getPaint().getShader());

                bitmap.recycle();
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        });
    }

    @Test
    public void glassStyleSurfaceReusesShadersAcrossRepeatedDrawsWithUnchangedBounds() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                FrameLayout view = new FrameLayout(context);
                Class<?> surfaceType = Class.forName("com.lenerd46.spotifyplus.features.GlassStyle$Surface");
                Constructor<?> ctor = surfaceType.getDeclaredConstructor(View.class, float.class, int.class);
                ctor.setAccessible(true);
                Drawable surface = (Drawable) ctor.newInstance(view, 40f, 50);
                surface.setBounds(0, 0, 300, 80);

                Field fillShaderField = surfaceType.getDeclaredField("fillShader");
                Field strokeShaderField = surfaceType.getDeclaredField("strokeShader");
                fillShaderField.setAccessible(true);
                strokeShaderField.setAccessible(true);

                Bitmap bitmap = Bitmap.createBitmap(300, 80, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);

                surface.draw(canvas);
                LinearGradient fill1 = (LinearGradient) fillShaderField.get(surface);
                LinearGradient stroke1 = (LinearGradient) strokeShaderField.get(surface);
                assertNotNull(fill1);
                assertNotNull(stroke1);

                surface.draw(canvas);
                LinearGradient fill2 = (LinearGradient) fillShaderField.get(surface);
                LinearGradient stroke2 = (LinearGradient) strokeShaderField.get(surface);
                assertSame("Fill shader must be reused when bounds do not change", fill1, fill2);
                assertSame("Stroke shader must be reused when bounds do not change", stroke1, stroke2);

                bitmap.recycle();
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        });
    }
}
