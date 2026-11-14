package com.lenerd46.spotifyplus;

import android.app.Activity;
import android.app.Application;
import android.content.*;
import android.content.pm.ApplicationInfo;
import android.content.res.Resources;
import android.content.res.XModuleResources;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.*;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.google.android.material.button.MaterialButton;
import com.lenerd46.spotifyplus.hooks.*;
import com.lenerd46.spotifyplus.scripting.ScriptManager;
//import com.yausername.youtubedl_android.YoutubeDL;
import de.robv.android.xposed.*;
import de.robv.android.xposed.callbacks.XC_InitPackageResources;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;
import org.luckypray.dexkit.DexKitBridge;

import java.io.*;
import java.lang.ref.WeakReference;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public class XposedLoader implements IXposedHookLoadPackage, IXposedHookZygoteInit, IXposedHookInitPackageResources {
    static {
        System.loadLibrary("dexkit");
    }

    private DexKitBridge bridge;
    private String modulePath = null;
    private static final String MODULE_VERSION = BuildConfig.VERSION_NAME;

    @Override
    public void handleLoadPackage(LoadPackageParam lpparam) throws Throwable {
        if (!lpparam.packageName.equals("com.spotify.music"))
            return;
        XposedBridge.log("[SpotifyPlus] Loading SpotifyPlus v" + MODULE_VERSION);

        if (bridge == null) {
            try {
                bridge = DexKitBridge.create(lpparam.appInfo.sourceDir);
            } catch (Exception e) {
                XposedBridge.log(e);
            }
        }

        SpotifyUserHook.init(lpparam.classLoader);
        new NowPlayingHeartHook().init(lpparam, bridge);

        XposedHelpers.findAndHookMethod(Activity.class, "onResume", new XC_MethodHook() {
            @Override
            protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                Activity activity = (Activity) param.thisObject;
                References.currentActivity = activity;
            }
        });

        XposedHelpers.findAndHookMethod(Activity.class, "onDestroy", new XC_MethodHook() {
            @Override
            protected void afterHookedMethod(MethodHookParam param) {
                Activity activity = (Activity) param.thisObject;
                if (References.currentActivity == activity) References.currentActivity = null;
                if (com.lenerd.spotifyplus.module.SpotifyHook.currentActivity == activity)
                    com.lenerd.spotifyplus.module.SpotifyHook.currentActivity = null;
            }
        });

        XposedHelpers.findAndHookMethod(Activity.class, "onActivityResult", int.class, int.class, Intent.class,
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                        int requestCode = (int) param.args[0];
                        Intent data = (Intent) param.args[2];

                        if (requestCode == 9072022 && data != null) {
                            Uri tree = data.getData();
                            ContentResolver content = ((Activity) param.thisObject).getContentResolver();
                            content.takePersistableUriPermission(tree,
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

                            SharedPreferences prefs = ((Activity) param.thisObject).getSharedPreferences("SpotifyPlus",
                                    Context.MODE_PRIVATE);
                            prefs.edit().putString("scripts_directory", tree.toString()).apply();
                        }
                    }
                });

        final boolean[] startupInitialized = {false};
        XposedHelpers.findAndHookMethod(Activity.class, "onCreate", Bundle.class, new XC_MethodHook() {
            @Override
            protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                Activity activity = (Activity) param.thisObject;
                Typeface beautifulFont = References.beautifulFont.get();

                if (beautifulFont == null) {
                    try {
                        Resources resources = References.modResources != null
                                ? References.modResources
                                : XModuleResources.createInstance(modulePath, null);
                        SharedPreferences prefs = activity.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);
                        String fontPref = prefs.getString("lyrics_font", "default");
                        String assetPath;
                        if ("spotify".equals(fontPref)) {
                            assetPath = "fonts/spotifymix-medium.ttf";
                        } else if ("apple".equals(fontPref)) {
                            assetPath = "fonts/sf-pro-display-bold.ttf";
                        } else {
                            assetPath = "fonts/lyrics_medium.ttf";
                        }
                        beautifulFont = Typeface.createFromAsset(resources.getAssets(), assetPath);
                        References.setBeautifulFont(beautifulFont);
                        XposedBridge.log("[SpotifyPlus] Successfully loaded font (" + fontPref + ")!");
                    } catch (Throwable t) {
                        XposedBridge.log("[SpotifyPlus] Failed to load font (error)");
                        XposedBridge.log(t);
                    }
                }

                if (startupInitialized[0]) {
                    return;
                }
                startupInitialized[0] = true;

                navigateToStartupPage(activity);

                // Compatibility builds use the fork-specific update link in Settings → About.
            }
        });

        XposedHelpers.findAndHookMethod(Application.class, "attach", Context.class, new XC_MethodHook() {
            @Override
            protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                Context context = (Context) param.args[0];
                cleanUpCache(context);

                File outDir = new File(context.getCodeCacheDir(), "spotifyplus-libs");
                if (!outDir.exists() && !outDir.mkdirs())
                    throw new IllegalStateException("Failed to create cache directory");

//                extractLibraries(modulePath, outDir);
//                loadNativeLibraries(outDir);

                SpotifyBottomSheet.initialize(bridge, lpparam.classLoader);
                // new ScriptManager().init(context, lpparam.classLoader);
                ScriptManager.getInstance().init(context, lpparam.classLoader);
                new BeautifulLyricsHook().init(lpparam, bridge);
                new NowPlayingLyricsGradientHook().init(lpparam, bridge);
                new NowPlayingViewHook(context).init(lpparam, bridge);
                new RemoveCreateButtonHook(context).init(lpparam, bridge);
                new NetworkHook(context).init(lpparam, bridge);
                new LastFmHook().init(lpparam, bridge);
                new ContextMenu_AddButton().init(lpparam, bridge);
//                new HomePageHook().init(lpparam, bridge);
                new AnimatedAlbumArtwork().init(lpparam, bridge);
//                new TestingHook().init(lpparam, bridge);
                new NewContextMenuHook().init(lpparam, bridge);
                new SleepTimerHook(context).init(lpparam, bridge);
                new PrivateSessionHook(context).init(lpparam, bridge);
                new ThemeHook((Application) param.thisObject).init(lpparam, bridge);
                new GlassStyleHook(context).init(lpparam, bridge);
                com.lenerd46.spotifyplus.api2.Api2Runtime.initialize(context, lpparam.classLoader, bridge, modulePath);
                new com.lenerd46.spotifyplus.hooks.PlaybackHistoryHook(context).init(lpparam, bridge);
                com.lenerd46.spotifyplus.hooks.ShareLinkSanitizerHook.install(lpparam);
                // new ThemeTest().init(lpparam, bridge);
                // new LikedSongHook().init(lpparam, bridge);
                // new KaraokeHook().init(lpparam, bridge);
            }
        });
    }

    @Override
    public void initZygote(StartupParam startupParam) throws Throwable {
        modulePath = startupParam.modulePath;
    }

    private void navigateToStartupPage(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);
        String page = prefs.getString("startup_page", "HOME");

        Intent intent = new Intent();
        intent.setAction(Intent.ACTION_VIEW);
        intent.setPackage("com.spotify.music");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        switch (page) {
            case "HOME":
                intent.setData(Uri.parse("spotify:home"));
                break;

            case "SEARCH":
                intent.setData(Uri.parse("spotify:search"));
                break;

            case "EXPLORE":
                intent.setData(Uri.parse("spotify:find"));
                break;

            case "LIBRARY":
                intent.setData(Uri.parse("spotify:collection"));
                break;
        }

        activity.startActivity(intent);
    }

    public boolean hasInternet(Context ctx) {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) ctx
                    .getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null)
                return false;

            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.net.Network nw = cm.getActiveNetwork();
                if (nw == null)
                    return false;
                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(nw);
                if (caps == null)
                    return false;
                // INTERNET = can reach the internet, VALIDATED = actually has connectivity (not
                // just a Wi‑Fi w/o backhaul)
                return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            } else {
                @SuppressWarnings("deprecation")
                android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
                @SuppressWarnings("deprecation")
                boolean connected = (ni != null && ni.isConnected());
                return connected;
            }
        } catch (Throwable t) {
            // Never crash due to OEM weirdness
            de.robv.android.xposed.XposedBridge.log("[SpotifyPlus] hasInternet() failed: " + t);
            return false;
        }
    }

    private void cleanUpCache(Context context) {
        File[] files = context.getCacheDir().listFiles();

        for (File file : files) {
            if (file.getName().endsWith(".apk")) {
                file.delete();
            }
        }
    }

    private static final int COLOR_BACKGROUND_PRIMARY = 0xFF000000;
    private static final int COLOR_BACKGROUND_SECONDARY = 0xFF121212;
    private static final int COLOR_ACCENT = 0xFF1ED760;
    private static final int COLOR_ACCENT_PRESSED = 0xFF1ABC54;

    @Override
    public void handleInitPackageResources(XC_InitPackageResources.InitPackageResourcesParam resparam)
            throws Throwable {
        if (!"com.spotify.music".equals(resparam.packageName)) {
            return;
        }

        References.modResources = XModuleResources.createInstance(modulePath, resparam.res);
        References.xresources = resparam.res;

        // final int primaryBackground = 0xFF000000; // AMOLED black
        // final int secondaryBackground = 0xFF121212; // elevated cards / surfaces
        // final int accentColor = 0xFF1ED760; // Spotify green
        // final int accentPressed = 0xFF1ABC54; // darker pressed green
        //
        // final boolean overridePlayerGradientColor = true;
        //
        // // Main background color
        // replaceColor(resparam, "gray_7", primaryBackground);
        // replaceColor(resparam, "gray_10", primaryBackground);
        // replaceColor(resparam, "dark_base_background_base", primaryBackground);
        // replaceColor(resparam, "dark_base_background_elevated_base",
        // primaryBackground);
        // replaceColor(resparam, "sthlm_blk", primaryBackground);
        // replaceColor(resparam, "sthlm_blk_grad_start", primaryBackground);
        // replaceColor(resparam, "image_placeholder_color", primaryBackground);
        //
        // // Player gradient:
        // // ReVanced skips bg_gradient_start_color unless overridePlayerGradientColor
        // is enabled,
        // // but always themes the end color.
        // if (overridePlayerGradientColor) {
        // replaceColor(resparam, "bg_gradient_start_color", primaryBackground);
        // }
        // replaceColor(resparam, "bg_gradient_end_color", primaryBackground);
        //
        // // Secondary background color
        // replaceColor(resparam, "gray_15", secondaryBackground);
        // replaceColor(resparam, "track_credits_card_bg", secondaryBackground);
        // replaceColor(resparam, "benefit_list_default_color", secondaryBackground);
        // replaceColor(resparam, "merch_card_background", secondaryBackground);
        // replaceColor(resparam, "opacity_white_10", secondaryBackground);
        // replaceColor(resparam, "dark_base_background_tinted_highlight",
        // secondaryBackground);
        //
        // // Accent color
        // replaceColor(resparam, "dark_brightaccent_background_base", accentColor);
        // replaceColor(resparam, "dark_base_text_brightaccent", accentColor);
        // replaceColor(resparam, "green_light", accentColor);
        // replaceColor(resparam, "spotify_green_157", accentColor);
        //
        // // Pressed accent color
        // replaceColor(resparam, "dark_brightaccent_background_press", accentPressed);
        //
        // XposedBridge.log("[SpotifyPlus] Custom theme resources applied");
    }

    private void replaceColor(XC_InitPackageResources.InitPackageResourcesParam resparam, String name, int color) {
        try {
            resparam.res.setReplacement("com.spotify.music", "color", name, color);
            XposedBridge.log("[SpotifyPlus] Replaced color resource: " + name);
        } catch (Throwable t) {
            XposedBridge.log("[SpotifyPlus] Failed to replace color resource: " + name);
            XposedBridge.log(t);
        }
    }

    private static void extractLibraries(String apkPath, File outDir) throws Exception {
        if(!outDir.exists() && !outDir.mkdirs()) throw new IllegalStateException("Failed to create cache directory");

        try(ZipFile zip = new ZipFile(apkPath)) {
            String abi = findBestAbi(zip);
            if(abi == null) throw new IllegalStateException("No compatible native libraries found");

            String prefix = "lib/" + abi + "/";
            Enumeration<? extends ZipEntry> entries = zip.entries();

            while(entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();

                if(entry.isDirectory() || !entry.getName().startsWith(prefix)) continue;

                String fileName = entry.getName().substring(prefix.length());
                if(fileName.isEmpty()) continue;

                File outFile = new File(outDir, fileName);

                try(InputStream in = zip.getInputStream(entry); FileOutputStream out = new FileOutputStream(outFile, false)) {
                    byte[] buffer = new byte[8192];
                    int read;

                    while((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                }

                Log.d("SpotifyPlus", "Extracted native file: " + fileName);
            }
        }
    }

    private static String findBestAbi(ZipFile zip) {
        for(String abi : Build.SUPPORTED_ABIS) {
            String prefix = "lib/" + abi + "/";

            Enumeration<? extends ZipEntry> entries = zip.entries();
            while(entries.hasMoreElements()) {
                if(entries.nextElement().getName().startsWith(prefix)) return abi;
            }
        }

        return null;
    }

    private static void loadNativeLibraries(File dir) {
        loadIfExists(dir, "libandroid-support.so");

        loadIfExists(dir, "libpython.so");

        loadIfExists(dir, "libavutil.so.59");
        loadIfExists(dir, "libswresample.so.5");
        loadIfExists(dir, "libswscale.so.8");
        loadIfExists(dir, "libavcodec.so.61");
        loadIfExists(dir, "libavformat.so.61");
        loadIfExists(dir, "libavfilter.so.10");
        loadIfExists(dir, "libavdevice.so.61");

        loadIfExists(dir, "libffmpeg.so");
    }

    private static void loadIfExists(File dir, String name) {
        File file = new File(dir, name);

        if(!file.exists()) {
            Log.d("SpotifyPlus", "Native library does not exist: " + name);
            return;
        }

        Log.d("SpotifyPlus", "Loading native library: " + file.getAbsolutePath());
        System.load(file.getAbsolutePath());
    }

    private static void extractAndLoad(String apkPath, File outDir, String libName) throws Exception {
        ZipEntry entry = findBestLibEntry(apkPath, libName);
        if (entry == null) {
            Log.d("SpotifyPlus", "Library not found in APK, skipping: " + libName);
            return;
        }

        File outFile = new File(outDir, libName);
        extractEntry(apkPath, entry, outFile);
        Log.d("SpotifyPlus", "Loading " + outFile.getAbsolutePath());
        System.load(outFile.getAbsolutePath());
    }

    private static ZipEntry findBestLibEntry(String apkPath, String libName) throws Exception {
        try (ZipFile zip = new ZipFile(apkPath)) {
            for (String abi : Build.SUPPORTED_ABIS) {
                ZipEntry entry = zip.getEntry("lib/" + abi + "/" + libName);
                if (entry != null) return entry;
            }

            ZipEntry fallback = zip.getEntry("lib/arm64-v8a/" + libName);
            if (fallback != null) return fallback;

            fallback = zip.getEntry("lib/armeabi-v7a/" + libName);
            if (fallback != null) return fallback;

            fallback = zip.getEntry("lib/x86_64/" + libName);
            if (fallback != null) return fallback;

            fallback = zip.getEntry("lib/x86/" + libName);
            return fallback;
        }
    }

    private static void extractEntry(String apkPath, ZipEntry entry, File outFile) throws Exception {
        try (ZipFile zip = new ZipFile(apkPath); InputStream in = zip.getInputStream(entry); FileOutputStream out = new FileOutputStream(outFile, false)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            out.flush();
        }
    }

    public class LibraryContext extends ContextWrapper {
        private final ApplicationInfo applicationInfo;

        public LibraryContext(Context base, File nativeLibraryDir) {
            super(base);

            applicationInfo = new ApplicationInfo(base.getApplicationInfo());
            applicationInfo.nativeLibraryDir = nativeLibraryDir.getAbsolutePath();
        }

        @Override
        public ApplicationInfo getApplicationInfo() {
            return applicationInfo;
        }
    }
}
