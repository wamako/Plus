package com.lenerd46.spotifyplus.beautifullyrics.entities;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.widget.Toast;
import com.lenerd46.spotifyplus.References;
import com.lenerd46.spotifyplus.SpotifyTrack;
import de.robv.android.xposed.XposedBridge;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Provides long-press lyric copy actions and renders/shares styled non-AMOLED PNG quote cards.
 */
public final class LyricShareHelper {
    private static final ExecutorService SHARE_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "SpotifyPlus-LyricShare");
        t.setDaemon(true);
        return t;
    });

    private LyricShareHelper() {
    }

    public static String formatQuoteText(List<String> rawLines, String title, String artist) {
        List<String> cleanLines = new ArrayList<>();
        if (rawLines != null) {
            for (String line : rawLines) {
                if (line != null) {
                    String trimmed = line.trim();
                    if (!trimmed.isEmpty()) cleanLines.add(trimmed);
                }
            }
        }
        String joined = String.join("\n", cleanLines);
        if (joined.isEmpty()) joined = "...";

        StringBuilder attribution = new StringBuilder();
        attribution.append('"').append(joined).append('"');
        String safeTitle = title != null ? title.trim() : "";
        String safeArtist = artist != null ? artist.trim() : "";
        if (!safeTitle.isEmpty() || !safeArtist.isEmpty()) {
            attribution.append("\n\u2014 ");
            if (!safeTitle.isEmpty()) attribution.append(safeTitle);
            if (!safeTitle.isEmpty() && !safeArtist.isEmpty()) attribution.append(" \u2022 ");
            if (!safeArtist.isEmpty()) attribution.append(safeArtist);
        }
        return attribution.toString();
    }

    public static String sanitizeFileStem(String rawTitle) {
        String base = rawTitle == null ? "" : rawTitle.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
        base = base.replaceAll("^_+|_+$", "");
        if (base.isEmpty()) base = "quote";
        if (base.length() > 36) base = base.substring(0, 36);
        return "spotifyplus_lyric_" + base + ".png";
    }

    public static void showLineActionDialog(
            Activity activity,
            String primaryLine,
            SpotifyTrack track,
            Bitmap albumArt,
            int accentArgb
    ) {
        if (activity == null || activity.isFinishing()) return;
        String cleanLine = primaryLine == null ? "" : primaryLine.trim();
        if (cleanLine.isEmpty()) return;

        String title = track != null && track.title != null ? track.title : "";
        String artist = track != null && track.artist != null ? track.artist : "";
        String quoteWithAttr = formatQuoteText(Collections.singletonList(cleanLine), title, artist);

        String[] items = new String[]{
                "Copy lyric line",
                "Copy lyric with song info",
                "Share lyric quote card (PNG)"
        };

        try {
            new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle(cleanLine.length() > 48 ? cleanLine.substring(0, 48) + "..." : cleanLine)
                    .setItems(items, (dialog, which) -> {
                        if (which == 0) {
                            copyToClipboard(activity, cleanLine, "Lyric copied");
                        } else if (which == 1) {
                            copyToClipboard(activity, quoteWithAttr, "Lyric quote copied");
                        } else if (which == 2) {
                            shareQuoteCardAsync(activity, cleanLine, title, artist, albumArt, accentArgb, track != null ? track.uri : null);
                        }
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        } catch (Throwable t) {
            XposedBridge.log(t);
            copyToClipboard(activity, quoteWithAttr, "Lyric quote copied");
        }
    }

    public static void copyToClipboard(Context context, String text, String toastMessage) {
        if (context == null || text == null || text.isEmpty()) return;
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("Spotify Plus Lyric", text));
        }
        Toast.makeText(context, toastMessage, Toast.LENGTH_SHORT).show();
    }

    private static void shareQuoteCardAsync(
            Activity activity,
            String quoteLine,
            String title,
            String artist,
            Bitmap albumArt,
            int accentArgb,
            String trackUri
    ) {
        Toast.makeText(activity, "Rendering lyric card...", Toast.LENGTH_SHORT).show();
        SharedPreferences prefs = activity.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);
        String paletteId = LyricsPhase3Settings.getStaticPalette(prefs);

        SHARE_EXECUTOR.execute(() -> {
            Bitmap card = null;
            try {
                card = renderQuoteCardBitmap(quoteLine, title, artist, albumArt, accentArgb, paletteId);
                Uri savedUri = savePngToMediaStore(activity, card, sanitizeFileStem(title));
                String shareText = formatQuoteText(Collections.singletonList(quoteLine), title, artist);
                if (trackUri != null && trackUri.startsWith("spotify:track:")) {
                    String id = trackUri.substring("spotify:track:".length());
                    if (!id.isEmpty()) {
                        shareText = shareText + "\nhttps://open.spotify.com/track/" + id;
                    }
                }
                final String finalText = shareText;
                activity.runOnUiThread(() -> {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType("image/png");
                        send.putExtra(Intent.EXTRA_STREAM, savedUri);
                        send.putExtra(Intent.EXTRA_TEXT, finalText);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(Intent.createChooser(send, "Share Lyric Card"));
                    } catch (Throwable launchErr) {
                        XposedBridge.log(launchErr);
                        copyToClipboard(activity, finalText, "Could not open share sheet; lyric copied");
                    }
                });
            } catch (Throwable err) {
                XposedBridge.log(err);
                String fallback = formatQuoteText(Collections.singletonList(quoteLine), title, artist);
                activity.runOnUiThread(() -> copyToClipboard(activity, fallback, "Card share failed; lyric copied"));
            } finally {
                if (card != null && !card.isRecycled()) {
                    card.recycle();
                }
            }
        });
    }

    public static Bitmap renderQuoteCardBitmap(
            String quoteLine,
            String title,
            String artist,
            Bitmap albumArt,
            int accentArgb,
            String paletteId
    ) {
        final int width = 1080;
        final int height = 1350;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        int basePrimary;
        int baseSecondary;
        if (LyricsPhase3Settings.isStaticPalette(paletteId)) {
            basePrimary = LyricsPhase3Settings.primaryColorForPalette(paletteId);
            baseSecondary = LyricsPhase3Settings.secondaryColorForPalette(paletteId);
        } else {
            int safeAccent = LyricsPhase3Settings.enforceNonAmoledFloor(accentArgb);
            basePrimary = blendColors(safeAccent, 0xFF141822, 0.58f);
            baseSecondary = blendColors(safeAccent, 0xFF1E2636, 0.42f);
        }

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setShader(new LinearGradient(0, 0, width, height, basePrimary, baseSecondary, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, width, height, bgPaint);

        // Elevated non-AMOLED inner glass card
        Paint cardPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardPaint.setColor(0x28FFFFFF);
        RectF cardRect = new RectF(72, 92, width - 72, height - 92);
        canvas.drawRoundRect(cardRect, 44f, 44f, cardPaint);

        Paint cardFill = new Paint(Paint.ANTI_ALIAS_FLAG);
        cardFill.setColor(blendColors(baseSecondary, 0xFF181C26, 0.55f));
        RectF innerCardRect = new RectF(74, 94, width - 74, height - 94);
        canvas.drawRoundRect(innerCardRect, 42f, 42f, cardFill);

        // Header: album art + title + artist
        int artSize = 132;
        float artLeft = 128f;
        float artTop = 148f;
        if (albumArt != null && !albumArt.isRecycled()) {
            Paint artPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            Bitmap scaled = Bitmap.createScaledBitmap(albumArt, artSize, artSize, true);
            BitmapShader shader = new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            canvas.save();
            canvas.translate(artLeft, artTop);
            artPaint.setShader(shader);
            canvas.drawRoundRect(0, 0, artSize, artSize, 24f, 24f, artPaint);
            canvas.restore();
            if (scaled != albumArt && !scaled.isRecycled()) scaled.recycle();
        } else {
            Paint placeholder = new Paint(Paint.ANTI_ALIAS_FLAG);
            placeholder.setColor(0xFF283244);
            canvas.drawRoundRect(artLeft, artTop, artLeft + artSize, artTop + artSize, 24f, 24f, placeholder);
        }

        Typeface customFont = References.beautifulFont != null ? References.beautifulFont.get() : null;
        TextPaint titlePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(Color.WHITE);
        titlePaint.setTextSize(38f);
        titlePaint.setTypeface(customFont != null ? Typeface.create(customFont, Typeface.BOLD) : Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        TextPaint artistPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        artistPaint.setColor(0xB8FFFFFF);
        artistPaint.setTextSize(30f);
        if (customFont != null) artistPaint.setTypeface(customFont);

        float textLeft = artLeft + artSize + 32f;
        int headerMaxWidth = (int) (width - 128f - textLeft);
        String safeTitle = title != null && !title.isEmpty() ? title : "Now Playing";
        String safeArtist = artist != null ? artist : "";

        StaticLayout titleLayout = StaticLayout.Builder.obtain(safeTitle, 0, safeTitle.length(), titlePaint, Math.max(120, headerMaxWidth))
                .setMaxLines(2)
                .setEllipsize(android.text.TextUtils.TruncateAt.END)
                .build();
        canvas.save();
        canvas.translate(textLeft, artTop + 14f);
        titleLayout.draw(canvas);
        canvas.restore();

        if (!safeArtist.isEmpty()) {
            StaticLayout artistLayout = StaticLayout.Builder.obtain(safeArtist, 0, safeArtist.length(), artistPaint, Math.max(120, headerMaxWidth))
                    .setMaxLines(1)
                    .setEllipsize(android.text.TextUtils.TruncateAt.END)
                    .build();
            canvas.save();
            canvas.translate(textLeft, artTop + 14f + titleLayout.getHeight() + 8f);
            artistLayout.draw(canvas);
            canvas.restore();
        }

        // Open quote mark
        Paint quoteMarkPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        quoteMarkPaint.setColor(0x55FFFFFF);
        quoteMarkPaint.setTextSize(120f);
        quoteMarkPaint.setTypeface(Typeface.SERIF);
        canvas.drawText("\u201C", 122f, 430f, quoteMarkPaint);

        // Main lyric quote (adaptive size)
        int bodyWidth = width - 256;
        float fontSize = quoteLine.length() > 130 ? 48f : (quoteLine.length() > 75 ? 58f : 68f);
        TextPaint quotePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        quotePaint.setColor(Color.WHITE);
        quotePaint.setTextSize(fontSize);
        quotePaint.setTypeface(customFont != null ? Typeface.create(customFont, Typeface.BOLD) : Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        StaticLayout quoteLayout = StaticLayout.Builder.obtain(quoteLine, 0, quoteLine.length(), quotePaint, bodyWidth)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setLineSpacing(12f, 1.08f)
                .build();
        float bodyTop = Math.max(460f, (height - quoteLayout.getHeight()) / 2f + 20f);
        if (bodyTop + quoteLayout.getHeight() > height - 220f) {
            bodyTop = 440f;
        }
        canvas.save();
        canvas.translate(128f, bodyTop);
        quoteLayout.draw(canvas);
        canvas.restore();

        // Bottom badge
        Paint pillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        pillPaint.setColor(0x24FFFFFF);
        float pillTop = height - 188f;
        canvas.drawRoundRect(128f, pillTop, 488f, pillTop + 56f, 28f, 28f, pillPaint);

        TextPaint badgePaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        badgePaint.setColor(0xD8FFFFFF);
        badgePaint.setTextSize(26f);
        badgePaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        Rect bounds = new Rect();
        String badgeText = "SPOTIFY PLUS \u2022 LYRICS";
        badgePaint.getTextBounds(badgeText, 0, badgeText.length(), bounds);
        canvas.drawText(badgeText, 156f, pillTop + 37f, badgePaint);

        return bitmap;
    }

    private static Uri savePngToMediaStore(Context context, Bitmap bitmap, String fileName) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        if (Build.VERSION.SDK_INT >= 29) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/SpotifyPlus");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
        }
        Uri collection = Build.VERSION.SDK_INT >= 29
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new IllegalStateException("Cannot allocate MediaStore image entry");
        try {
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null || !bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    throw new IllegalStateException("PNG compression/write failed");
                }
            }
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues clear = new ContentValues();
                clear.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, clear, null, null);
            }
            return uri;
        } catch (Throwable t) {
            resolver.delete(uri, null, null);
            throw t;
        }
    }

    private static int blendColors(int fg, int bg, float ratio) {
        float inv = 1.0f - ratio;
        int r = Math.round(((fg >> 16) & 0xFF) * ratio + ((bg >> 16) & 0xFF) * inv);
        int g = Math.round(((fg >> 8) & 0xFF) * ratio + ((bg >> 8) & 0xFF) * inv);
        int b = Math.round((fg & 0xFF) * ratio + (bg & 0xFF) * inv);
        return LyricsPhase3Settings.enforceNonAmoledFloor(0xFF000000 | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF));
    }
}
