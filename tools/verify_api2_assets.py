#!/usr/bin/env python3
"""Check the actual bundled runtime and nested extension APK, not just the outer module."""
import io,json,struct,sys,zipfile
from verify_module_apk import validate_dex

def validate_storage_classes(classes):
    assert "Lcom/lenerd/spotifyplus/module/hooks/StorageHook;" in classes, "Missing API-2 storage handler"
    assert "Lcom/lenerd46/spotifyplus/api2/Api2Runtime;" in classes, "Missing API-2 bootstrap"


def needed_libraries(data):
    """Read ELF64 DT_NEEDED through program headers, including stripped binaries."""
    assert data[:6] == b'\x7fELF\x02\x01', 'Expected little-endian ELF64'
    offset=struct.unpack_from('<Q',data,32)[0]
    size,count=struct.unpack_from('<HH',data,54)
    segments=[struct.unpack_from('<IIQQQQQQ',data,offset+i*size) for i in range(count)]
    dynamic=next(p for p in segments if p[0]==2)
    entries=[struct.unpack_from('<qQ',data,i) for i in range(dynamic[2],dynamic[2]+dynamic[5],16)]
    strings=next(value for tag,value in entries if tag==5)
    segment=next(p for p in segments if p[0]==1 and p[3]<=strings<p[3]+p[5])
    base=segment[2]+strings-segment[3]
    return [data[base+value:data.index(b'\0',base+value)].decode() for tag,value in entries if tag==1]

def validate_load_order(binaries, order):
    loaded=set()
    for name in order:
        for dependency in needed_libraries(binaries[name]):
            if dependency in binaries:
                assert dependency in loaded, f'{name} requires {dependency} before loading'
        loaded.add(name)

def verify(path):
    with zipfile.ZipFile(path) as apk:
        host_classes=set()
        for entry in apk.namelist():
            if entry.endswith('.dex') and '/' not in entry:
                host_classes.update(validate_dex(entry,apk.read(entry)))
        validate_storage_classes(host_classes)
        order=json.loads(apk.read('assets/api2-native-load-order.json'))
        assert set(order)=={'libc++_shared.so','libnode.so','libnative-lib.so'}, 'Incomplete native bootstrap'
        binaries={name:apk.read('lib/arm64-v8a/'+name) for name in order}
        validate_load_order(binaries,order)
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
        print(f'PASS: ARM64 API-2 storage handler, runtime, marketplace, settings, Beautiful Lyrics ({count} DEX files)')

if __name__=='__main__':verify(sys.argv[1])
