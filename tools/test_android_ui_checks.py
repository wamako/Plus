import contextlib,io,json,pathlib,tempfile,types,unittest
from unittest.mock import patch
import run_android_ui_checks as checks

class AndroidUiRunnerTests(unittest.TestCase):
    def execute(self,*,guest='1',instrument='OK (5 tests)\n'):
        with tempfile.TemporaryDirectory() as directory:
            report=pathlib.Path(directory)/'report.json';calls=[]
            def command(*args,**kwargs):
                calls.append(args)
                if args[:2]==('shell','getprop'):
                    value={'ro.kernel.qemu':guest,'ro.build.version.sdk':'37','ro.product.cpu.abi':'x86_64'}[args[2]]
                    return types.SimpleNamespace(stdout=value.encode())
                if args[:3]==('shell','am','instrument'):return types.SimpleNamespace(stdout=instrument.encode())
                if args[0]=='pull':pathlib.Path(args[-1]).write_bytes(bytes.fromhex('89504e470d0a1a0a'))
                return types.SimpleNamespace(stdout=b'')
            argv=['checks','--module','module.apk','--tests','tests.apk','--report',str(report)]
            with patch.object(checks,'run',side_effect=command),patch('sys.argv',argv),contextlib.redirect_stdout(io.StringIO()):
                try:checks.main();error=None
                except RuntimeError as caught:error=caught
            return calls,json.loads(report.read_text()),error
    def test_root_is_only_used_for_our_fixture_after_all_five_tests_pass(self):
        calls,report,error=self.execute();self.assertIsNone(error);self.assertTrue(report['passed']);self.assertEqual(report['tests_passed'],5)
        instrument=next(i for i,c in enumerate(calls) if c[:3]==('shell','am','instrument'))
        root=calls.index(('root',));self.assertGreater(root,instrument)
        self.assertTrue(calls[root+2][0]=='pull');self.assertEqual(calls[root+2][1],'/sdcard/Android/data/com.lenerd46.spotifyplus/files/glass-fixture.png')
        self.assertFalse(report['authenticated_playback_tested']);self.assertFalse(report['samsung_rendering_tested'])
    def test_failed_or_incomplete_instrumentation_cannot_pass_or_elevate_adb(self):
        calls,report,error=self.execute(instrument='FAILURES!!!\nTests run: 5, Failures: 1')
        self.assertIsNotNone(error);self.assertFalse(report['passed']);self.assertNotIn(('root',),calls);self.assertFalse(any(c[0]=='pull' for c in calls))
    def test_physical_or_populated_profile_is_not_assumed_to_be_our_avd(self):
        calls,report,error=self.execute(guest='0');self.assertIsNotNone(error);self.assertFalse(report['passed']);self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
