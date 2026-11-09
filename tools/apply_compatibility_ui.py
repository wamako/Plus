"""Owned compatibility UI patches, applied after the pinned upstream backports."""
from pathlib import Path
from apply_upstream_updates import change

TRUST = ('Extensions run inside Spotify and can access its session and app data. '
         'Only install or update code from developers you trust. This is not an isolated sandbox.')


def apply(source):
    settings = source / 'scripts/settings/src/app.tsx'
    change(settings, 'Choose a folder that contains unpacked Spotify Plus extensions for development.',
           'Choose a folder of unpacked extensions. ' + TRUST + ' Selecting or refreshing it runs its code.')
    change(settings, "<AboutLink title='GitHub' onPress={() => SpotifyPlus.Navigation.open('https://github.com/lenerd/spotifyplus')} />",
           "<AboutLink title='Compatibility build updates' onPress={() => SpotifyPlus.Navigation.open('https://github.com/wamako/Plus/pull/2')} />\n"
           "            <Text style={{ color: '#b3b3b3', fontSize: 13, paddingHorizontal: 12, marginBottom: 16 }}>"
           "Updates for this Spotify 9.1.94.1929 build are reviewed manually. Upstream APKs may require a different Spotify version."
           "</Text>\n            <AboutLink title='Upstream project' onPress={() => SpotifyPlus.Navigation.open('https://gitlab.com/LeNerd46/spotify-plus')} />")
    market = source / 'scripts/marketplace/src'
    page = market / 'extension-page.tsx'
    anchor = "                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>"
    change(page, anchor, "                    <Text textColor={Colors.onSurfaceVariant} fontSize={14} style={{ marginTop: 20, lineHeight: 20 }}>" + TRUST + "</Text>\n" + anchor)
    change(page, "return '↓  Install';", "return 'Trust and install';")
    change(page, "return updateAvailable ? '↓  Update' : '✓  Installed';", "return updateAvailable ? 'Trust and update' : '✓  Installed';")
    installed = market / 'installed-page.tsx'
    anchor = '            <View style={{ flexDirection: \'row\', alignItems: \'center\', gap: 10, marginTop: 16, }} >'
    change(installed, anchor, '            {updateAvailable && <Text textColor={Colors.onSurfaceVariant} fontSize={13} style={{ marginTop: 12, lineHeight: 18 }}>' + TRUST + '</Text>}\n' + anchor)
    # Preserve existing progress and failure labels; change only the ready action.
    change(installed, "'Update';", "'Trust and update';")
