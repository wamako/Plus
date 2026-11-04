#!/usr/bin/env python3
"""Check the actual bundled runtime and nested extension APK, not just the outer module."""
import io,json,struct,sys,zipfile
from verify_module_apk import validate_dex

def verify(path):
    with zipfile.ZipFile(path) as apk:
        for name in ['lib/arm64-v8a/libnode.so','lib/arm64-v8a/libnative-lib.so','assets/nodejs/addons/arm64-v8a/spotifyplus_bridge.node']:
            data=apk.read(name)
            assert data[:5]==b'\x7fELF\x02' and struct.unpack_from('<H',data,18)[0]==183, f'Invalid ARM64 runtime binary: {name}'
        for name in ['assets/nodejs/host.js','assets/nodejs/elevated/marketplace/index.js','assets/nodejs/elevated/settings/index.js']:
            assert len(apk.read(name))>100, f'Missing runtime entry: {name}'
        for name in ['marketplace','settings']:
            base='assets/nodejs/elevated/'+name+'/'
            metadata=json.loads(apk.read(base+'manifest.json'))
            assert metadata['api']==2 and len(apk.read(base+metadata['main']))>100
        prefix='assets/api2-extensions/beautiful-lyrics/'
        manifest=json.loads(apk.read(prefix+'manifest.json'))
        assert manifest['api']==2
        assert len(apk.read(prefix+manifest['main']))>100
        with zipfile.ZipFile(io.BytesIO(apk.read(prefix+manifest['native']['apk']))) as native:
            assert native.testzip() is None
            classes=set();count=0
            for name in native.namelist():
                if name.endswith('.dex') and '/' not in name:
                    found=validate_dex(name,native.read(name));assert not classes.intersection(found),'Duplicate extension classes';classes.update(found);count+=1
            assert count>0
            assert 'L'+manifest['native']['pluginClass'].replace('.','/')+';' in classes,'Missing native plugin entry point'
        print(f'PASS: ARM64 API-2 runtime, marketplace, settings, Beautiful Lyrics ({count} DEX files)')

if __name__=='__main__':verify(sys.argv[1])
