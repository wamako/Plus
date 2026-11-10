package com.lenerd.spotifyplus.module.scripting;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.view.View;
import android.widget.FrameLayout;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ScriptImageTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private static final String GIF = "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7";

    private File gif() throws Exception {
        File file = File.createTempFile("animated-fixture", ".gif", context.getCacheDir());
        try (FileOutputStream out = new FileOutputStream(file)) { out.write(Base64.decode(GIF, Base64.DEFAULT)); }
        return file;
    }

    @Test public void decodesStaticAndAnimatedImagesAndRejectsInvalidOrOversizedInput() throws Exception {
        File png = File.createTempFile("static-fixture", ".png", context.getCacheDir());
        File gif = gif();
        try {
            Bitmap bitmap = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.RED);
            try (FileOutputStream out = new FileOutputStream(png)) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)); }
            bitmap.recycle();
            Drawable still = ScriptImageLoader.decode(context, android.net.Uri.fromFile(png).toString());
            assertEquals(4, still.getIntrinsicWidth());
            assertFalse(still instanceof Animatable);
            assertTrue(ScriptImageLoader.decode(context, gif.getAbsolutePath()) instanceof Animatable);
            try (FileOutputStream out = new FileOutputStream(png)) { out.write(new byte[]{1, 2, 3}); }
            try { ScriptImageLoader.decode(context, png.getAbsolutePath()); fail("invalid image accepted"); } catch (IOException expected) {}
            InputStream oversized = new InputStream() {
                int remaining = ScriptImageLoader.MAX_ENCODED_BYTES + 1;
                public int read() { if (remaining <= 0) return -1; remaining--; return 0; }
                public int read(byte[] bytes, int offset, int length) {
                    if (remaining <= 0) return -1;
                    int count = Math.min(length, remaining); remaining -= count; return count;
                }
            };
            try { ScriptImageLoader.readBounded(oversized); fail("oversized image accepted"); } catch (IOException expected) {}
        } finally { png.delete(); gif.delete(); }
    }

    @Test public void realAnimationStopsWhenHiddenReplacedOrDetached() throws Exception {
        File gif = gif();
        final Drawable drawable = ScriptImageLoader.decode(context, gif.getAbsolutePath());
        final Animatable animation = (Animatable) drawable;
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = instrumentation.startActivitySync(new Intent()
            .setClassName(context, "com.lenerd46.spotifyplus.testfixtures.ImageTestActivity")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            final FrameLayout[] root = new FrameLayout[1];
            final ScriptImageView[] image = new ScriptImageView[1];
            instrumentation.runOnMainSync(() -> {
                root[0] = new FrameLayout(activity);
                image[0] = new ScriptImageView(activity);
                image[0].setImageDrawable(drawable);
                assertFalse(animation.isRunning());
                root[0].addView(image[0], new FrameLayout.LayoutParams(100, 100));
                activity.setContentView(root[0]);
            });
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> {
                assertTrue(image[0].isAttachedToWindow());
                assertTrue(animation.isRunning());
                root[0].setVisibility(View.INVISIBLE); assertFalse(animation.isRunning());
                root[0].setVisibility(View.VISIBLE); assertTrue(animation.isRunning());
                image[0].setImageDrawable(null); assertFalse(animation.isRunning());
                image[0].setImageDrawable(drawable); assertTrue(animation.isRunning());
                root[0].removeView(image[0]); assertFalse(animation.isRunning());
            });
        } finally {
            instrumentation.runOnMainSync(activity::finish);
            gif.delete();
        }
    }
}
