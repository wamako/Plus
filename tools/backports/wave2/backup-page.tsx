import React, { useEffect, useRef, useState } from 'react';
import { SpotifyPlus } from 'spotifyplus';
import { Pressable, ScrollView, Text, View } from 'spotifyplus/react';

interface BackupStats {
    ok: boolean;
    prefStores: number;
    totalKeys: number;
    hasTheme: boolean;
}

interface BackupResult {
    sequence: number;
    ok: boolean;
    action: string;
    message: string;
    fileName?: string;
}

interface ClipboardPreview {
    raw: string;
    prefStores: number;
    totalKeys: number;
    hasTheme: boolean;
    exportedAt: string;
    moduleVersion: string;
}

function readStats(): BackupStats | null {
    try {
        return SpotifyPlus.Platform.Storage.get<BackupStats>('@backup/stats');
    } catch {
        return null;
    }
}

function readLastResult(): BackupResult | null {
    try {
        return SpotifyPlus.Platform.Storage.get<BackupResult>('@backup/last-result');
    } catch {
        return null;
    }
}

const ActionButton = ({
    title,
    subtitle,
    accent = false,
    onPress,
}: {
    title: string;
    subtitle?: string;
    accent?: boolean;
    onPress: () => void;
}) => (
    <Pressable
        onPress={onPress}
        style={{
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: accent ? '#1ed760' : '#242424',
            marginBottom: 10,
        }}
    >
        <Text style={{ color: accent ? '#121212' : '#ffffff', fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {!!subtitle && (
            <Text style={{ color: accent ? '#183823' : '#b3b3b3', fontSize: 13, marginTop: 4 }}>{subtitle}</Text>
        )}
    </Pressable>
);

export const BackupPage = () => {
    const [stats, setStats] = useState<BackupStats | null>(readStats);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<ClipboardPreview | null>(null);
    const [picking, setPicking] = useState(false);
    const pickSeqRef = useRef(0);

    const refresh = () => {
        setStats(readStats());
        return readLastResult();
    };

    useEffect(() => {
        if (!picking) return;
        let active = true;
        const id = setInterval(() => {
            if (!active) return;
            const latest = readLastResult();
            if (latest && latest.sequence > pickSeqRef.current && latest.action !== 'pick-file-launched') {
                setPicking(false);
                refresh();
                if (latest.ok) {
                    setError('');
                    setStatus(latest.message);
                } else {
                    setStatus('');
                    setError(latest.message);
                }
            }
        }, 800);
        const timeout = setTimeout(() => {
            if (active) setPicking(false);
        }, 45000);
        return () => {
            active = false;
            clearInterval(id);
            clearTimeout(timeout);
        };
    }, [picking]);

    const saveToDownloads = () => {
        setError('');
        setStatus('');
        try {
            SpotifyPlus.Platform.Storage.set('@backup/save-downloads', { now: Date.now() });
            const latest = refresh();
            if (latest?.ok) setStatus(latest.message);
            else setError(latest?.message || 'Could not save backup to Downloads.');
        } catch (err) {
            setError(String(err));
        }
    };

    const copyToClipboard = () => {
        setError('');
        setStatus('');
        try {
            const data = SpotifyPlus.Platform.Storage.get<Record<string, unknown>>('@backup/export-json');
            if (!data || data.format !== 'spotifyplus-backup-v1') {
                setError('Could not build backup JSON.');
                return;
            }
            const formatted = JSON.stringify(data, null, 2);
            SpotifyPlus.Platform.Clipboard.writeText(formatted);
            setStatus(`Copied full backup JSON (${formatted.length.toLocaleString()} chars) to clipboard.`);
        } catch (err) {
            setError(String(err));
        }
    };

    const pickFileToRestore = () => {
        setError('');
        setStatus('Select a spotifyplus-backup-*.json file in Android picker...');
        try {
            const before = readLastResult();
            pickSeqRef.current = (before?.sequence ?? 0) + 1;
            SpotifyPlus.Platform.Storage.set('@backup/pick-file', {});
            const after = readLastResult();
            if (after && !after.ok) {
                setStatus('');
                setError(after.message);
                return;
            }
            if (after) pickSeqRef.current = after.sequence;
            setPicking(true);
        } catch (err) {
            setStatus('');
            setError(String(err));
        }
    };

    const inspectClipboard = () => {
        setError('');
        setStatus('');
        setPreview(null);
        try {
            const raw = SpotifyPlus.Platform.Clipboard.readText() || '';
            if (!raw.trim()) {
                setError('Clipboard is empty.');
                return;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.format !== 'spotifyplus-backup-v1' || typeof parsed.sharedPrefs !== 'object' || !parsed.sharedPrefs) {
                setError('Clipboard does not contain a valid spotifyplus-backup-v1 payload.');
                return;
            }
            const prefNames = Object.keys(parsed.sharedPrefs);
            let totalKeys = 0;
            for (const name of prefNames) {
                const group = parsed.sharedPrefs[name];
                if (group && typeof group === 'object') totalKeys += Object.keys(group).length;
            }
            const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : 'Unknown date';
            setPreview({
                raw,
                prefStores: prefNames.length,
                totalKeys,
                hasTheme: !!parsed.theme,
                exportedAt,
                moduleVersion: String(parsed.moduleVersion || 'Unknown'),
            });
        } catch (err) {
            setError(`Invalid clipboard JSON: ${String(err)}`);
        }
    };

    const confirmClipboardRestore = () => {
        if (!preview) return;
        setError('');
        setStatus('');
        try {
            SpotifyPlus.Platform.Storage.set('@backup/import-json', preview.raw);
            const latest = refresh();
            if (latest?.ok) {
                setPreview(null);
                setStatus(latest.message);
            } else {
                setError(latest?.message || 'Restore failed.');
            }
        } catch (err) {
            setError(String(err));
        }
    };

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#202020', marginBottom: 16 }}>
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Current Backup Scope</Text>
                <Text style={{ color: '#b3b3b3', fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                    Includes extension storage (Local Suite ratings, bookmarks, outro skips, stats, Last.fm/username settings), theme config, and Spotify Plus module preferences.
                </Text>
                <Text style={{ color: '#1ed760', fontSize: 14, fontWeight: '600', marginTop: 8 }}>
                    {stats
                        ? `${stats.prefStores} preference stores · ${stats.totalKeys} keys · Theme ${stats.hasTheme ? 'included' : 'default'}`
                        : 'Stats unavailable'}
                </Text>
            </View>

            <Text style={{ color: '#b3b3b3', fontSize: 13, fontWeight: '600', marginBottom: 10 }}>EXPORT & BACKUP</Text>
            <ActionButton
                title='Save backup to Downloads'
                subtitle='Writes Download/SpotifyPlus/spotifyplus-backup-*.json'
                accent
                onPress={saveToDownloads}
            />
            <ActionButton
                title='Copy backup JSON to clipboard'
                subtitle='Useful for quick transfer or notes backup'
                onPress={copyToClipboard}
            />

            <Text style={{ color: '#b3b3b3', fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 10 }}>RESTORE & IMPORT</Text>
            <ActionButton
                title='Restore from file picker'
                subtitle='Choose a saved backup JSON via Android Documents'
                onPress={pickFileToRestore}
            />
            <ActionButton
                title='Preview clipboard backup'
                subtitle='Validates backup JSON from clipboard before writing'
                onPress={inspectClipboard}
            />

            {preview && (
                <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#202020', marginTop: 6, marginBottom: 12 }}>
                    <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Clipboard Backup Verified</Text>
                    <Text style={{ color: '#b3b3b3', fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                        Exported: {preview.exportedAt}{'\n'}
                        Module build: {preview.moduleVersion}{'\n'}
                        Stores: {preview.prefStores} ({preview.totalKeys} keys){'\n'}
                        Custom theme: {preview.hasTheme ? 'Yes' : 'No'}
                    </Text>
                    <View style={{ marginTop: 10 }}>
                        <ActionButton
                            title='Confirm restore from clipboard'
                            subtitle='Overwrites matching preference keys and theme config'
                            accent
                            onPress={confirmClipboardRestore}
                        />
                    </View>
                </View>
            )}

            <ActionButton
                title='Refresh status'
                subtitle='Check backup counts or last picker restore result'
                onPress={() => {
                    const latest = refresh();
                    if (latest && latest.action !== 'idle') {
                        if (latest.ok) {
                            setError('');
                            setStatus(latest.message);
                        } else {
                            setStatus('');
                            setError(latest.message);
                        }
                    }
                }}
            />

            {!!status && <Text style={{ color: '#1ed760', fontSize: 14, lineHeight: 20, marginTop: 8 }}>{status}</Text>}
            {!!error && <Text style={{ color: '#ff7777', fontSize: 14, lineHeight: 20, marginTop: 8 }}>{error}</Text>}

            <Text style={{ color: '#888888', fontSize: 12, lineHeight: 18, marginTop: 16 }}>
                After restoring a backup, force-stop and reopen Spotify so all extensions and native hooks reload your restored preferences and theme.
            </Text>
        </ScrollView>
    );
};
