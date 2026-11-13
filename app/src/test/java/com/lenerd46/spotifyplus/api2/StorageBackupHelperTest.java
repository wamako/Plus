package com.lenerd46.spotifyplus.api2;

import org.junit.Test;

import java.util.Set;

import static org.junit.Assert.*;

public class StorageBackupHelperTest {
    @Test
    public void suiteKeysShareStoreAcrossWamakoExtensionsOnly() {
        assertEquals(
                "com.wamako.suite",
                StorageBackupHelper.resolvePrefsName("com.wamako.listeningstats", "@suite/track-ratings-v1")
        );
        assertEquals(
                "com.wamako.suite",
                StorageBackupHelper.resolvePrefsName("com.wamako.bookmarksplus", "@suite/bookmarks-v1")
        );
        assertEquals(
                "com.wamako.sortplay",
                StorageBackupHelper.resolvePrefsName("com.wamako.sortplay", "lastfm-key")
        );
        assertEquals(
                "com.lenerd.lyrics",
                StorageBackupHelper.resolvePrefsName("com.lenerd.lyrics", "@suite/track-ratings-v1")
        );
    }

    @Test
    public void backupKeysOnlyTriggerForSettingsExtension() {
        assertTrue(StorageBackupHelper.isBackupKey("com.lenerd.settings", "@backup/stats"));
        assertTrue(StorageBackupHelper.isBackupKey("com.lenerd.settings", "@backup/export-json"));
        assertFalse(StorageBackupHelper.isBackupKey("com.wamako.sortplay", "@backup/stats"));
        assertFalse(StorageBackupHelper.isBackupKey("com.lenerd.settings", "theme-auto"));
    }

    @Test
    public void allowedBackupPrefsExcludeSpotifyInternalStoresAndPathTraversal() {
        Set<String> extras = Set.of("dev.community.ext");
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("SpotifyPlus", extras));
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("SpotifyPlusAPI2", extras));
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("com.wamako.suite", extras));
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("com.wamako.bookmarksplus", extras));
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("com.lenerd.playnext", extras));
        assertTrue(StorageBackupHelper.isAllowedBackupPrefName("dev.community.ext", extras));

        assertFalse(StorageBackupHelper.isAllowedBackupPrefName("com.spotify.music_preferences", extras));
        assertFalse(StorageBackupHelper.isAllowedBackupPrefName("../SpotifyPlus", extras));
        assertFalse(StorageBackupHelper.isAllowedBackupPrefName("a/b", extras));
        assertFalse(StorageBackupHelper.isAllowedBackupPrefName("", extras));
        assertFalse(StorageBackupHelper.isAllowedBackupPrefName(null, extras));
    }
}
