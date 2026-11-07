#!/usr/bin/env python3
"""Selected MIT-licensed upstream c407383 updates, retaining our API-2 ABI."""
from pathlib import Path
import argparse,shutil
UPSTREAM='c407383820660d4273703f53d517ce12beced77e'

def change(p,old,new):
 s=p.read_text()
 if old in s:s=s.replace(old,new);p.write_text(s)
 elif new not in s:raise RuntimeError('Backport anchor changed: '+str(p)+': '+old[:60])

def runtime(root):
 p=root/'loader/script-manifest.ts'
 change(p,"    const author = optionalString(manifest.author, 'manifest.author');","    const author = compatibleAuthor(manifest.author);")
 if 'function compatibleAuthor' not in p.read_text():
  p.write_text(p.read_text()+'''\n// Upstream now uses author arrays; keep the delivered legacy string manifests valid.
function compatibleAuthor(value: unknown): string | undefined {
 if(value === undefined || value === null) return undefined;
 if(typeof value === 'string') return value;
 if(!Array.isArray(value)) throw new Error('manifest.author must be text or an author array');
 return value.map((entry: unknown) => {
  if(!entry || typeof entry !== 'object' || typeof (entry as any).name !== 'string' || !(entry as any).name.trim() || typeof (entry as any).url !== 'string' || !(entry as any).url.trim()) throw new Error('Invalid manifest author');
  return (entry as any).name.trim();
 }).join(', ');
}
''')
 p=root/'loader/script-api.ts'
 change(p,'export interface LocalExtensionInfo {','export interface ExtensionSource { owner: string; name: string; branch: string; }\n\nexport interface LocalExtensionInfo {')
 change(p,'    installedAt: string;\n}', '    installedAt: string;\n    main?: string;\n    source?: ExtensionSource;\n}')
 change(p,'    files: ExtensionInstallFile[];\n}', '    files: ExtensionInstallFile[];\n    source?: ExtensionSource;\n}')
 change(p,'    uninstallExtension(extensionId: string): LocalExtensionInfo;', '    uninstallExtension(extensionId: string): LocalExtensionInfo;\n    readInstalledExtensionMain(extensionId: string): string;')
 change(p,'                uninstallExtension: extensionId => runtime.uninstallExtension(extensionId),','                uninstallExtension: extensionId => runtime.uninstallExtension(extensionId),\n                readInstalledExtensionMain: extensionId => runtime.readInstalledExtensionMain(extensionId),')
 p=root/'loader/host-runtime.ts'
 change(p,'import type { ExtensionInstallRequest, LocalExtensionInfo, NavigationTarget }','import type { ExtensionInstallRequest, ExtensionSource, LocalExtensionInfo, NavigationTarget }')
 change(p,'        const manifest = parseManifest(request?.manifest);','        const manifest = parseManifest(request?.manifest);\n        const repositorySource = request.source === undefined ? undefined : parseExtensionSource(request.source);')
 change(p,'            writeInstallPackage(staging, manifest, request.manifest, request.files);','            writeInstallPackage(staging, manifest, request.manifest, request.files);\n            if(repositorySource) fs.writeFileSync(path.join(staging, SOURCE_FILE), JSON.stringify(repositorySource), "utf8");')
 change(p,'        installedAt: fs.statSync(directory).mtime.toISOString(),','        installedAt: fs.statSync(directory).mtime.toISOString(),\n        main: manifest.main,\n        source: readExtensionSource(directory),')
 if '    readInstalledExtensionMain(extensionId:' not in p.read_text():
  change(p,'    uninstallExtension(extensionId: string): LocalExtensionInfo {','''    readInstalledExtensionMain(extensionId: string): string {
        const installedRoot=this.config.installedRoot;
        if(!installedRoot) throw new Error('Marketplace installation is not configured');
        assertInstallableScriptId(extensionId);
        const root=path.resolve(installedRoot), target=path.resolve(root,extensionId);
        assertPathInside(root,target);
        const manifest=parseManifest(JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8')));
        const entry=path.resolve(target,...manifest.main.split('/'));assertPathInside(target,entry);
        return fs.readFileSync(entry,'utf8');
    }
    uninstallExtension(extensionId: string): LocalExtensionInfo {''')
 if 'const SOURCE_FILE =' not in p.read_text():
  p.write_text(p.read_text()+'''
const SOURCE_FILE = '.spotifyplus-source.json';
function parseExtensionSource(value: unknown): ExtensionSource {
 const source=value as Partial<ExtensionSource> | null;
 const valid=(text: unknown,pattern: RegExp): text is string => typeof text==='string' && text.length<=255 && pattern.test(text);
 if(!source || !valid(source.owner,/^[A-Za-z0-9-]+$/) || !valid(source.name,/^[A-Za-z0-9._-]+$/) || !valid(source.branch,/^[^\\u0000-\\u001f\\u007f]+$/)) throw new Error('Invalid extension repository source');
 return {owner:source.owner,name:source.name,branch:source.branch};
}
function readExtensionSource(directory: string): ExtensionSource | undefined {
 try{return parseExtensionSource(JSON.parse(fs.readFileSync(path.join(directory,SOURCE_FILE),'utf8')));}catch{return undefined;}
}
''')

def projects(source,latest):
 market=source/'scripts/marketplace'
 shutil.copytree(latest/'scripts/marketplace',market,dirs_exist_ok=True)
 # The old SDK has the same metadata/install operations. New author arrays and
 # repository provenance are added by runtime() above; retain cache await repair.
 p=market/'src/fetch-metadata.ts'
 s=p.read_text().replace('JSON.parse(SpotifyPlus.Platform.Storage.Cache.read(', 'JSON.parse(await SpotifyPlus.Platform.Storage.Cache.read(')
 # Accept both the old authors array and the release's author array.
 s=s.replace('author: z.array(authorSchema).optional(),','author: z.union([z.array(authorSchema),z.string()]).optional(), authors: z.array(authorSchema.extend({ url: z.string().optional() })).optional(),')
 s=s.replace('formatAuthors(manifest.author, user)',"formatAuthors(Array.isArray(manifest.author) ? manifest.author : manifest.authors, user)")
 s=s.replace("authors: { name: string, url: string }[] | undefined", "authors: { name: string, url?: string }[] | undefined").replace("url: sanitizeUrl(author.url)", "url: sanitizeUrl(author.url || `https://www.github.com/${user}`)")
 p.write_text(s)
 p=market/'src/types/extension.ts';p.write_text(p.read_text().replace('author?: MarketplaceAuthor[];', 'author?: string | MarketplaceAuthor[];'))
 p=market/'src/installed-page.tsx';p.write_text(p.read_text().replace("installed.author?.map(author => author.name).join(', ') || 'Unknown developer'", "(typeof installed.author === 'string' ? installed.author : installed.author?.map(author => author.name).join(', ')) || 'Unknown developer'"))
 p=market/'src/index.tsx';p.write_text(p.read_text().replace('}, marketplaceIcon).register();','}).register();'))
 p=market/'package.json';p.write_text(p.read_text().replace(' ../../app/src/main/assets/nodejs-src/tools/tests/marketplace-compatibility.test.mjs',''))
 # These tests exercise the actual selected marketplace files through esbuild.
 tests=source/'app/src/main/assets/nodejs-src/tools/tests'
 for name in ['marketplace-markdown','marketplace-metadata','marketplace-updates']:
  shutil.copy2(latest/'app/src/main/assets/nodejs-src/tools/tests'/f'{name}.test.mjs',tests/f'{name}.test.mjs')
 shutil.copy2(Path(__file__).with_name('marketplace-legacy-author.test.mjs'),tests/'marketplace-legacy-author.test.mjs')
 p=market/'package.json';p.write_text(p.read_text().replace('marketplace-updates.test.mjs', 'marketplace-updates.test.mjs ../../app/src/main/assets/nodejs-src/tools/tests/marketplace-legacy-author.test.mjs'))
 p=tests/'marketplace-metadata.test.mjs';p.write_text(p.read_text().replace("['Author', null, {},","[null, {},").replace("    for (const value of","    assert.equal(schema.safeParse({ ...base, author: 'Legacy author' }).success, true);\n    for (const value of",1))
 p=tests/'marketplace-markdown.test.mjs';p.write_text(p.read_text().replace('schemaVersion, 4','schemaVersion, 7'))
 p=source/'scripts/settings/src/settings-components.tsx';s=p.read_text();new=(latest/'scripts/settings/src/settings-components.tsx').read_text()
 sections=[('interface SettingFieldProps {','interface SmallButtonProps {','interface SmallButtonProps {'),
 ('const SmallButton =','export const ExtensionSettingDivider','export const ExtensionSettingDivider'),
 ('export const ExtensionToggleSetting =','export const ExtensionToggleSettingOld','export const ExtensionSliderSetting'),
 ('export const ExtensionSliderSetting =','export const ExtensionTextSetting','export const ExtensionTextSetting'),
 ('export const ExtensionNumberSetting =','interface OptionRowProps','interface OptionRowProps')]
 for start,oldend,newend in sections:
  # Last selection is optional only when upstream moved the adjacent interface.
  if start not in s or oldend not in s or newend not in new:raise RuntimeError('Settings backport anchor changed: '+start)
  a=s.index(start);b=s.index(oldend,a);c=new.index(start);d=new.index(newend,c)
  s=s[:a]+new[c:d]+s[b:]
 if 'export const snapSettingValue =' not in s:s+='\n'+new[new.index('export const snapSettingValue ='):]
 p.write_text(s)
 p=source/'scripts/settings/src/app.tsx';t=p.read_text().replace("const SPOTIFY_PLUS_VERSION = '0.10.0-preview-1';","const SPOTIFY_PLUS_VERSION = '0.10.0-api2.9.1.94.15';").replace("const MARKETPLACE_VERSION = '0.1.0';","const MARKETPLACE_VERSION = '1.0.0';");p.write_text(t)
 # Keep settings manifest/version and native-only color/theme controls on the
 # existing implementation; copied controls require no new renderer protocol.

if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--sdk',type=Path);a.add_argument('--source',type=Path);a.add_argument('--upstream',type=Path);args=a.parse_args()
 if args.sdk:runtime(args.sdk)
 if args.source:
  if not args.upstream:raise SystemExit('--upstream is required')
  projects(args.source,args.upstream);runtime(args.source/'app/src/main/assets/nodejs-src')
