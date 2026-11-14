package com.lenerd46.spotifyplus.api2;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Handles cross-extension shared suite storage (@suite/*) and full backup/restore (@backup/*). */
public final class StorageBackupHelper {
    public static final String BACKUP_FORMAT = "spotifyplus-backup-v1";
    public static final String SETTINGS_SCRIPT_ID = "com.lenerd.settings";
    public static final String SUITE_PREFIX = "com.wamako.";
    public static final String SUITE_SHARED_PREFS = "com.wamako.suite";
    public static final String SUITE_KEY_PREFIX = "@suite/";
    public static final String BACKUP_KEY_PREFIX = "@backup/";
    public static final int REQUEST_BACKUP_RESTORE_FILE = 0x5350424B;

    private static final String TAG = "SpotifyPlus:Backup";
    private static final int MAX_IMPORT_BYTES = 8 * 1024 * 1024;

    private static int resultSequence = 0;
    private static String lastResultJson = "{\"sequence\":0,\"ok\":true,\"action\":\"idle\",\"message\":\"Ready\"}";

    private StorageBackupHelper() {}

    public static String resolvePrefsName(String scriptId, String key) {
        if (scriptId != null && scriptId.startsWith(SUITE_PREFIX)
                && key != null && key.startsWith(SUITE_KEY_PREFIX)) {
            return SUITE_SHARED_PREFS;
        }
        return scriptId;
    }

    public static boolean isBackupKey(String scriptId, String key) {
        return SETTINGS_SCRIPT_ID.equals(scriptId) && key != null && key.startsWith(BACKUP_KEY_PREFIX);
    }

    public static boolean isAllowedBackupPrefName(String name, Set<String> extraExtensionIds) {
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) {
            return false;
        }
        if ("SpotifyPlus".equals(name)
                || "SpotifyPlusAPI2".equals(name)
                || "spotifyplus_elevated".equals(name)
                || SUITE_SHARED_PREFS.equals(name)) {
            return true;
        }
        if (name.startsWith(SUITE_PREFIX) || name.startsWith("com.lenerd.") || name.startsWith("spotifyplus_")) {
            return true;
        }
        return extraExtensionIds != null && extraExtensionIds.contains(name);
    }

    public static JSONObject serializePrefValue(Object value) throws Exception {
        JSONObject entry = new JSONObject();
        if (value instanceof Boolean) {
            entry.put("t", "b");
            entry.put("v", value);
        } else if (value instanceof Integer) {
            entry.put("t", "i");
            entry.put("v", value);
        } else if (value instanceof Long) {
            entry.put("t", "l");
            entry.put("v", String.valueOf(value));
        } else if (value instanceof Float) {
            entry.put("t", "f");
            entry.put("v", ((Float) value).doubleValue());
        } else if (value instanceof Set<?>) {
            entry.put("t", "ss");
            JSONArray arr = new JSONArray();
            for (Object item : (Set<?>) value) {
                if (item != null) arr.put(String.valueOf(item));
            }
            entry.put("v", arr);
        } else {
            entry.put("t", "s");
            entry.put("v", value == null ? "" : String.valueOf(value));
        }
        return entry;
    }

    public static void applyPrefEntry(SharedPreferences.Editor editor, String key, Object rawEntry) throws Exception {
        if (rawEntry instanceof JSONObject entry && entry.has("t") && entry.has("v")) {
            String type = entry.getString("t");
            switch (type) {
                case "b":
                    editor.putBoolean(key, entry.getBoolean("v"));
                    return;
                case "i":
                    editor.putInt(key, entry.getInt("v"));
                    return;
                case "l":
                    Object lv = entry.get("v");
                    editor.putLong(key, lv instanceof Number ? ((Number) lv).longValue() : Long.parseLong(String.valueOf(lv)));
                    return;
                case "f":
                    editor.putFloat(key, (float) entry.getDouble("v"));
                    return;
                case "ss":
                    JSONArray arr = entry.getJSONArray("v");
                    Set<String> set = new LinkedHashSet<>();
                    for (int i = 0; i < arr.length(); i++) {
                        set.add(arr.getString(i));
                    }
                    editor.putStringSet(key, set);
                    return;
                default:
                    editor.putString(key, String.valueOf(entry.get("v")));
                    return;
            }
        }
        if (rawEntry instanceof Boolean b) {
            editor.putBoolean(key, b);
        } else if (rawEntry instanceof Integer i) {
            editor.putInt(key, i);
        } else if (rawEntry instanceof Long l) {
            editor.putLong(key, l);
        } else if (rawEntry instanceof Double || rawEntry instanceof Float) {
            editor.putFloat(key, ((Number) rawEntry).floatValue());
        } else {
            editor.putString(key, String.valueOf(rawEntry));
        }
    }

    public static JSONObject validateBackupObject(JSONObject root, Set<String> extraExtensionIds) throws Exception {
        if (root == null) throw new IllegalArgumentException("Backup JSON must be an object.");
        String format = root.optString("format", "");
        if (!BACKUP_FORMAT.equals(format)) {
            throw new IllegalArgumentException("Unsupported backup format: " + (format.isEmpty() ? "(missing)" : format));
        }
        JSONObject prefs = root.optJSONObject("sharedPrefs");
        if (prefs == null) {
            throw new IllegalArgumentException("Backup JSON is missing sharedPrefs.");
        }
        Iterator<String> names = prefs.keys();
        while (names.hasNext()) {
            String prefName = names.next();
            if (!isAllowedBackupPrefName(prefName, extraExtensionIds)) {
                throw new IllegalArgumentException("Disallowed preference store in backup: " + prefName);
            }
            if (prefs.optJSONObject(prefName) == null) {
                throw new IllegalArgumentException("Invalid preference map for store: " + prefName);
            }
        }
        if (root.has("theme") && root.opt("theme") != JSONObject.NULL && root.optJSONObject("theme") == null) {
            throw new IllegalArgumentException("Backup theme block must be a JSON object.");
        }
        return root;
    }

    public static synchronized String handleBackupGet(Context context, String key) {
        if (context == null) return null;
        try {
            return switch (key) {
                case "@backup/stats" -> buildStatsJson(context).toString();
                case "@backup/export-json" -> buildBackupObject(context).toString();
                case "@backup/last-result" -> lastResultJson;
                default -> null;
            };
        } catch (Exception e) {
            Log.e(TAG, "Backup read failed for " + key, e);
            return recordResult(false, key, "Backup read failed: " + safeMsg(e), null);
        }
    }

    public static synchronized void handleBackupSet(Activity activity, String key, Object rawValue) {
        if (activity == null) return;
        try {
            String text = unwrapJsonString(rawValue);
            switch (key) {
                case "@backup/save-downloads" -> saveBackupToDownloads(activity);
                case "@backup/import-json" -> importBackupJson(activity, text, "import-json");
                case "@backup/pick-file" -> launchFilePicker(activity);
                default -> recordResult(false, key, "Unknown backup command: " + key, null);
            }
        } catch (Exception e) {
            Log.e(TAG, "Backup action failed for " + key, e);
            recordResult(false, key, safeMsg(e), null);
        }
    }

    public static synchronized boolean handleActivityResult(Context context, int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_BACKUP_RESTORE_FILE) return false;
        if (context == null || resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            recordResult(false, "pick-file", "File restore cancelled.", null);
            return true;
        }
        Uri uri = data.getData();
        try {
            ContentResolver resolver = context.getContentResolver();
            String jsonText;
            try (InputStream in = resolver.openInputStream(uri)) {
                if (in == null) throw new IllegalStateException("Could not open selected file.");
                jsonText = readBoundedUtf8(in, MAX_IMPORT_BYTES);
            }
            importBackupJson(context, jsonText, "pick-file");
            com.lenerd46.spotifyplus.features.FeatureSheets.toast("Spotify Plus backup restored. Restart Spotify to apply.");
        } catch (Exception e) {
            Log.e(TAG, "Failed restoring selected backup file", e);
            recordResult(false, "pick-file", "Restore failed: " + safeMsg(e), null);
            com.lenerd46.spotifyplus.features.FeatureSheets.toast("Restore failed: " + safeMsg(e));
        }
        return true;
    }

    private static String unwrapJsonString(Object rawValue) throws Exception {
        if (rawValue == null || rawValue == JSONObject.NULL) return "";
        String s = String.valueOf(rawValue).trim();
        if (s.startsWith("\"")) {
            Object parsed = new JSONTokener(s).nextValue();
            if (parsed instanceof String str) return str;
        }
        return s;
    }

    private static Set<String> discoverExtensionIds(Context context) {
        Set<String> ids = new HashSet<>();
        File filesDir = context.getFilesDir();
        File[] roots = new File[] {
                new File(filesDir, "spotifyplus-installed-extensions"),
                new File(filesDir, "spotifyplus-local-extensions"),
                new File(filesDir, "nodejs/elevated"),
                new File(filesDir, "nodejs/scriptss")
        };
        for (File root : roots) {
            if (!root.isDirectory()) continue;
            File[] dirs = root.listFiles();
            if (dirs == null) continue;
            for (File dir : dirs) {
                File manifest = new File(dir, "manifest.json");
                if (!manifest.isFile()) continue;
                try {
                    String content = new String(Files.readAllBytes(manifest.toPath()), StandardCharsets.UTF_8);
                    String id = new JSONObject(content).optString("id", "").trim();
                    if (!id.isEmpty()) ids.add(id);
                } catch (Exception ignored) {}
            }
        }
        return ids;
    }

    private static List<String> discoverBackupPrefNames(Context context, Set<String> extraIds) {
        Set<String> names = new LinkedHashSet<>();
        names.add(SUITE_SHARED_PREFS);
        names.add("spotifyplus_elevated");
        names.add("SpotifyPlus");
        names.add("SpotifyPlusAPI2");
        File sharedPrefsDir = new File(context.getApplicationInfo().dataDir, "shared_prefs");
        File[] xmlFiles = sharedPrefsDir.listFiles();
        if (xmlFiles != null) {
            for (File file : xmlFiles) {
                String fname = file.getName();
                if (!fname.endsWith(".xml")) continue;
                String prefName = fname.substring(0, fname.length() - 4);
                if (isAllowedBackupPrefName(prefName, extraIds)) {
                    names.add(prefName);
                }
            }
        }
        List<String> sorted = new ArrayList<>(names);
        Collections.sort(sorted);
        return sorted;
    }

    private static JSONObject buildStatsJson(Context context) {
        Set<String> extraIds = discoverExtensionIds(context);
        List<String> prefNames = discoverBackupPrefNames(context, extraIds);
        int nonEmptyStores = 0;
        int totalKeys = 0;
        for (String name : prefNames) {
            Map<String, ?> entries = context.getSharedPreferences(name, Context.MODE_PRIVATE).getAll();
            if (entries != null && !entries.isEmpty()) {
                nonEmptyStores++;
                totalKeys += entries.size();
            }
        }
        File themeFile = new File(context.getFilesDir(), "spotifyplus-theme.json");
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            out.put("format", BACKUP_FORMAT);
            out.put("prefStores", nonEmptyStores);
            out.put("totalKeys", totalKeys);
            out.put("hasTheme", themeFile.isFile());
            out.put("timestamp", System.currentTimeMillis());
        } catch (Exception ignored) {}
        return out;
    }

    private static JSONObject buildBackupObject(Context context) throws Exception {
        Set<String> extraIds = discoverExtensionIds(context);
        List<String> prefNames = discoverBackupPrefNames(context, extraIds);
        JSONObject sharedPrefs = new JSONObject();
        for (String name : prefNames) {
            Map<String, ?> all = context.getSharedPreferences(name, Context.MODE_PRIVATE).getAll();
            if (all == null || all.isEmpty()) continue;
            JSONObject entries = new JSONObject();
            List<String> keys = new ArrayList<>(all.keySet());
            Collections.sort(keys);
            for (String key : keys) {
                entries.put(key, serializePrefValue(all.get(key)));
            }
            sharedPrefs.put(name, entries);
        }

        JSONObject root = new JSONObject();
        root.put("format", BACKUP_FORMAT);
        root.put("exportedAt", System.currentTimeMillis());
        root.put("spotifyVersion", com.lenerd.spotifyplus.module.Utils.spotifyVersion);
        root.put("moduleVersion", com.lenerd46.spotifyplus.BuildConfig.VERSION_NAME);
        File themeFile = new File(context.getFilesDir(), "spotifyplus-theme.json");
        if (themeFile.isFile()) {
            try {
                String raw = new String(Files.readAllBytes(themeFile.toPath()), StandardCharsets.UTF_8);
                root.put("theme", new JSONObject(raw));
            } catch (Exception e) {
                Log.w(TAG, "Skipping unreadable theme file during export", e);
            }
        }
        root.put("sharedPrefs", sharedPrefs);
        return root;
    }

    private static void saveBackupToDownloads(Context context) throws Exception {
        JSONObject backup = buildBackupObject(context);
        byte[] bytes = backup.toString(2).getBytes(StandardCharsets.UTF_8);
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        String fileName = "spotifyplus-backup-" + stamp + ".json";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SpotifyPlus");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create file in Downloads/SpotifyPlus.");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("Could not open Downloads output stream.");
                out.write(bytes);
                out.flush();
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SpotifyPlus");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Cannot create Downloads/SpotifyPlus folder.");
            File target = new File(dir, fileName);
            try (FileOutputStream out = new FileOutputStream(target)) {
                out.write(bytes);
                out.flush();
            }
        }
        recordResult(true, "save-downloads", "Saved Downloads/SpotifyPlus/" + fileName, fileName);
    }

    private static void importBackupJson(Context context, String rawJson, String action) throws Exception {
        if (rawJson == null || rawJson.isBlank()) throw new IllegalArgumentException("Backup JSON is empty.");
        Object parsed = new JSONTokener(rawJson).nextValue();
        if (!(parsed instanceof JSONObject obj)) {
            throw new IllegalArgumentException("Backup JSON must be an object.");
        }
        Set<String> extraIds = discoverExtensionIds(context);
        validateBackupObject(obj, extraIds);

        JSONObject sharedPrefs = obj.getJSONObject("sharedPrefs");
        int restoredStores = 0;
        int restoredKeys = 0;
        Iterator<String> prefNames = sharedPrefs.keys();
        while (prefNames.hasNext()) {
            String prefName = prefNames.next();
            JSONObject entries = sharedPrefs.getJSONObject(prefName);
            SharedPreferences.Editor editor = context.getSharedPreferences(prefName, Context.MODE_PRIVATE).edit();
            Iterator<String> keys = entries.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                applyPrefEntry(editor, k, entries.get(k));
                restoredKeys++;
            }
            if (!editor.commit()) {
                throw new IllegalStateException("Failed writing preferences for " + prefName);
            }
            restoredStores++;
        }

        boolean themeRestored = false;
        JSONObject theme = obj.optJSONObject("theme");
        if (theme != null) {
            File themeFile = new File(context.getFilesDir(), "spotifyplus-theme.json");
            File tempFile = new File(context.getFilesDir(), "spotifyplus-theme.json.tmp");
            byte[] themeBytes = theme.toString(2).getBytes(StandardCharsets.UTF_8);
            try (FileOutputStream out = new FileOutputStream(tempFile)) {
                out.write(themeBytes);
                out.flush();
            }
            if (themeFile.exists() && !themeFile.delete()) {
                throw new IllegalStateException("Could not replace existing theme configuration.");
            }
            if (!tempFile.renameTo(themeFile)) {
                throw new IllegalStateException("Could not finalize restored theme configuration.");
            }
            themeRestored = true;
        }

        String msg = "Restored " + restoredStores + " stores (" + restoredKeys + " keys)"
                + (themeRestored ? " and theme settings" : "") + ". Restart Spotify to apply.";
        recordResult(true, action, msg, null);
    }

    private static void launchFilePicker(Activity activity) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain" });
        activity.startActivityForResult(intent, REQUEST_BACKUP_RESTORE_FILE);
        recordResult(true, "pick-file-launched", "Opened Android file picker for backup JSON.", null);
    }

    private static String readBoundedUtf8(InputStream in, int maxBytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > maxBytes) throw new IllegalArgumentException("Selected file exceeds 8 MiB limit.");
            out.write(buf, 0, n);
        }
        return out.toString(StandardCharsets.UTF_8);
    }

    private static String safeMsg(Throwable error) {
        String msg = error == null ? "" : error.getMessage();
        return msg == null || msg.isBlank() ? (error == null ? "Unknown error" : error.getClass().getSimpleName()) : msg;
    }

    private static String recordResult(boolean ok, String action, String message, String fileName) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("sequence", ++resultSequence);
            obj.put("ok", ok);
            obj.put("action", action);
            obj.put("message", message);
            if (fileName != null) obj.put("fileName", fileName);
            lastResultJson = obj.toString();
        } catch (Exception ignored) {}
        return lastResultJson;
    }
}
