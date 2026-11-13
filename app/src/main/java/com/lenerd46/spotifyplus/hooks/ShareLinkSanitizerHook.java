package com.lenerd46.spotifyplus.hooks;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import com.lenerd46.spotifyplus.References;
import com.lenerd46.spotifyplus.features.ShareTrackingSanitizer;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Strips Spotify share-tracking parameters (?si=, utm_*, etc.) from outbound Android Share
 * intents and in-app ClipboardManager share copies when enabled in General Settings.
 */
public final class ShareLinkSanitizerHook {
    private static final AtomicBoolean INSTALLED = new AtomicBoolean(false);
    private static final ThreadLocal<Boolean> REENTRANT_CLIP = new ThreadLocal<>();

    private ShareLinkSanitizerHook() {
    }

    public static void install(XC_LoadPackage.LoadPackageParam lpparam) {
        if (!INSTALLED.compareAndSet(false, true)) return;

        XposedBridge.hookAllMethods(Intent.class, "createChooser", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                if (!isEnabled()) return;
                if (param.args != null && param.args.length > 0 && param.args[0] instanceof Intent) {
                    sanitizeIntent((Intent) param.args[0], 0);
                }
            }
        });

        XposedBridge.hookAllMethods(Activity.class, "startActivityForResult", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                if (!isEnabled()) return;
                if (param.args != null && param.args.length > 0 && param.args[0] instanceof Intent) {
                    sanitizeIntent((Intent) param.args[0], 0);
                }
            }
        });

        XposedBridge.hookAllMethods(ContextWrapper.class, "startActivity", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                if (!isEnabled()) return;
                if (param.args != null && param.args.length > 0 && param.args[0] instanceof Intent) {
                    sanitizeIntent((Intent) param.args[0], 0);
                }
            }
        });

        XposedBridge.hookAllMethods(ClipboardManager.class, "setPrimaryClip", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) {
                if (Boolean.TRUE.equals(REENTRANT_CLIP.get()) || !isEnabled()) return;
                if (param.args == null || param.args.length == 0 || !(param.args[0] instanceof ClipData)) return;
                ClipData original = (ClipData) param.args[0];
                ClipData cleaned = sanitizeClipData(original);
                if (cleaned != null) {
                    REENTRANT_CLIP.set(Boolean.TRUE);
                    try {
                        param.args[0] = cleaned;
                    } finally {
                        REENTRANT_CLIP.remove();
                    }
                }
            }
        });
    }

    private static boolean isEnabled() {
        Activity activity = References.currentActivity;
        Context ctx = activity;
        if (ctx == null) return true;
        SharedPreferences prefs = ctx.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);
        return prefs.getBoolean(ShareTrackingSanitizer.PREF_KEY, true);
    }

    static void sanitizeIntent(Intent intent, int depth) {
        if (intent == null || depth > 3) return;
        String action = intent.getAction();
        boolean isShare = Intent.ACTION_SEND.equals(action)
                || Intent.ACTION_SEND_MULTIPLE.equals(action)
                || Intent.ACTION_CHOOSER.equals(action);
        boolean isExternalView = Intent.ACTION_VIEW.equals(action) && intent.getDataString() != null
                && ShareTrackingSanitizer.isSpotifyShareUrl(intent.getDataString());

        if (!isShare && !isExternalView) {
            Bundle extras = intent.getExtras();
            if (extras != null && extras.containsKey(Intent.EXTRA_INTENT)) {
                Intent inner = extras.getParcelable(Intent.EXTRA_INTENT);
                sanitizeIntent(inner, depth + 1);
            }
            return;
        }

        Uri data = intent.getData();
        if (data != null) {
            String raw = data.toString();
            String clean = ShareTrackingSanitizer.sanitizeSingleUrl(raw);
            if (!clean.equals(raw)) {
                intent.setData(Uri.parse(clean));
            }
        }

        if (intent.hasExtra(Intent.EXTRA_TEXT)) {
            CharSequence extra = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (extra != null) {
                String clean = ShareTrackingSanitizer.sanitizeText(extra.toString());
                if (!clean.equals(extra.toString())) {
                    intent.putExtra(Intent.EXTRA_TEXT, clean);
                }
            }
        }

        if (intent.getClipData() != null) {
            ClipData cleanedClip = sanitizeClipData(intent.getClipData());
            if (cleanedClip != null) {
                intent.setClipData(cleanedClip);
            }
        }

        Intent nested = intent.getParcelableExtra(Intent.EXTRA_INTENT);
        if (nested != null) sanitizeIntent(nested, depth + 1);
        android.os.Parcelable[] initialIntents = intent.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS);
        if (initialIntents != null) {
            for (android.os.Parcelable p : initialIntents) {
                if (p instanceof Intent) sanitizeIntent((Intent) p, depth + 1);
            }
        }
    }

    private static ClipData sanitizeClipData(ClipData clip) {
        if (clip == null || clip.getItemCount() == 0) return null;
        boolean changed = false;
        ClipData.Item[] newItems = new ClipData.Item[clip.getItemCount()];
        for (int i = 0; i < clip.getItemCount(); i++) {
            ClipData.Item item = clip.getItemAt(i);
            CharSequence text = item.getText();
            Uri uri = item.getUri();
            String cleanText = text != null ? ShareTrackingSanitizer.sanitizeText(text.toString()) : null;
            Uri cleanUri = uri != null ? Uri.parse(ShareTrackingSanitizer.sanitizeSingleUrl(uri.toString())) : null;
            boolean textChanged = text != null && !cleanText.equals(text.toString());
            boolean uriChanged = uri != null && !cleanUri.toString().equals(uri.toString());
            if (textChanged || uriChanged) {
                changed = true;
                newItems[i] = new ClipData.Item(textChanged ? cleanText : text, item.getHtmlText(),
                        item.getIntent(), uriChanged ? cleanUri : uri);
            } else {
                newItems[i] = item;
            }
        }
        if (!changed) return null;
        ClipData rebuilt = new ClipData(clip.getDescription(), newItems[0]);
        for (int i = 1; i < newItems.length; i++) {
            rebuilt.addItem(newItems[i]);
        }
        return rebuilt;
    }
}
