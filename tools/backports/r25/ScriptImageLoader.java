package com.lenerd.spotifyplus.module.scripting;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.nio.ByteBuffer;

/** Upstream animated raster decoding, with bounded input and the API 27 fallback retained. */
final class ScriptImageLoader {
    static final int MAX_ENCODED_BYTES = 16 * 1024 * 1024;
    private ScriptImageLoader() {}

    static Drawable decode(Context context, String src) throws IOException {
        File asset = ExtensionAssetRegistry.resolveFile(src);
        if (asset != null) {
            try (InputStream stream = new FileInputStream(asset)) { return decodeBytes(context, readBounded(stream)); }
        }
        if (src.startsWith("http://") || src.startsWith("https://")) {
            URLConnection connection = new URL(src).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            try (InputStream stream = connection.getInputStream()) { return decodeBytes(context, readBounded(stream)); }
        }
        if (src.startsWith("content://") || src.startsWith("file://") || src.startsWith("android.resource://")) {
            try (InputStream stream = context.getContentResolver().openInputStream(Uri.parse(src))) {
                if (stream == null) throw new IOException("Unable to open image");
                return decodeBytes(context, readBounded(stream));
            }
        }
        try (InputStream stream = new FileInputStream(src)) { return decodeBytes(context, readBounded(stream)); }
    }

    static byte[] readBounded(InputStream stream) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (count > MAX_ENCODED_BYTES - bytes.size()) throw new IOException("Image exceeds 16 MB");
            bytes.write(buffer, 0, count);
        }
        return bytes.toByteArray();
    }

    private static Drawable decodeBytes(Context context, byte[] bytes) throws IOException {
        if (Build.VERSION.SDK_INT >= 28) {
            return ImageDecoder.decodeDrawable(ImageDecoder.createSource(ByteBuffer.wrap(bytes)), (decoder, info, source) -> {
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                int largest = Math.max(info.getSize().getWidth(), info.getSize().getHeight());
                if (largest > 2048) decoder.setTargetSampleSize((largest + 2047) / 2048);
            });
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 2048) options.inSampleSize *= 2;
        options.inJustDecodeBounds = false;
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (bitmap == null) throw new IOException("Unable to decode image");
        return new BitmapDrawable(context.getResources(), bitmap);
    }
}
