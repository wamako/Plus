import struct, unittest
from verify_api2_assets import needed_libraries, validate_load_order

def fixture(dependencies):
    data=bytearray(1024);data[:6]=b'\x7fELF\x02\x01'
    struct.pack_into('<Q',data,32,64);struct.pack_into('<HH',data,54,56,2)
    struct.pack_into('<IIQQQQQQ',data,64,1,0,0,0,0,len(data),len(data),0)
    entries=[(5,512)];position=0
    for name in dependencies:
        encoded=name.encode()+b'\0';data[512+position:512+position+len(encoded)]=encoded
        entries.append((1,position));position+=len(encoded)
    entries.append((0,0))
    struct.pack_into('<IIQQQQQQ',data,120,2,0,256,256,0,len(entries)*16,len(entries)*16,0)
    for i,entry in enumerate(entries):struct.pack_into('<qQ',data,256+16*i,*entry)
    return bytes(data)

class DependencyTest(unittest.TestCase):
    def test_stripped_elf_dependency_table(self):
        self.assertEqual(['libc++_shared.so','liblog.so'],needed_libraries(fixture(['libc++_shared.so','liblog.so'])))
    def test_rejects_node_before_cpp(self):
        binaries={'libnode.so':fixture(['libc++_shared.so','liblog.so']),'libc++_shared.so':fixture(['libc.so'])}
        with self.assertRaisesRegex(AssertionError,'requires libc'):
            validate_load_order(binaries,['libnode.so','libc++_shared.so'])
        validate_load_order(binaries,['libc++_shared.so','libnode.so'])
