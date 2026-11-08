import contextlib,hashlib,io,json,pathlib,tempfile,types,unittest
from unittest.mock import patch
import run_android_ui_checks as checks

class AndroidUiRunnerTests(unittest.TestCase):
    def execute(self,*,guest='1',instrument='OK (9 tests)\n',valid_source=True):
        with tempfile.TemporaryDirectory() as directory:
            report=pathlib.Path(directory)/'report.json';model=pathlib.Path(directory)/'model.apk';model.write_bytes(b'fixture model');calls=[]
            def command(*args,**kwargs):
                calls.append(args)
                if args[:2]==('shell','getprop'):
                    value={'ro.kernel.qemu':guest,'ro.build.version.sdk':'37','ro.product.cpu.abi':'x86_64'}[args[2]]
                    return types.SimpleNamespace(stdout=value.encode())
                if args[:3]==('shell','pm','list'):return types.SimpleNamespace(stdout=b'package:com.lenerd46.spotifyplus.test uid:10124\npackage:com.lenerd46.spotifyplus uid:10123\n')
                if args[:3]==('shell','id','-u'):return types.SimpleNamespace(stdout=b'2000\n')
                if args[:3]==('shell','am','instrument'):return types.SimpleNamespace(stdout=instrument.encode())
                if args[0]=='pull':pathlib.Path(args[-1]).write_bytes(bytes.fromhex('89504e470d0a1a0a'))
                return types.SimpleNamespace(stdout=b'')
            argv=['checks','--module','module.apk','--tests','tests.apk','--spotify-model-apk',str(model),'--report',str(report)]
            expected=hashlib.sha256(model.read_bytes()).hexdigest() if valid_source else 'f'*64
            with patch.object(checks,'MODEL_SHA',expected),patch.object(checks,'run',side_effect=command),patch('sys.argv',argv),contextlib.redirect_stdout(io.StringIO()):
                try:checks.main();error=None
                except RuntimeError as caught:error=caught
            return calls,json.loads(report.read_text()),error
    def test_models_are_sealed_and_adb_unrooted_before_nine_checks_and_fixture_retrieval(self):
        calls,report,error=self.execute();self.assertIsNone(error);self.assertTrue(report['passed']);self.assertEqual(report['tests_passed'],9)
        instrument=next(i for i,c in enumerate(calls) if c[:3]==('shell','am','instrument'))
        roots=[i for i,c in enumerate(calls) if c==('root',)];self.assertEqual(len(roots),2);self.assertLess(roots[0],instrument);self.assertGreater(roots[1],instrument)
        self.assertLess(calls.index(('unroot',)),instrument)
        self.assertIn(('shell','chmod','0444','/data/user/0/com.lenerd46.spotifyplus/files/spotify-model.apk'),calls)
        self.assertTrue(report['spotify_explicit_selection_queue_verified']);self.assertTrue(report['spotify_autoplay_provider_readback_verified']);self.assertTrue(report['spotify_model_playback_serialization_verified']);self.assertTrue(report['spotify_model_queue_command_verified']);self.assertFalse(report['authenticated_playback_tested']);self.assertFalse(report['samsung_rendering_tested'])
    def test_failed_checks_cannot_pass_or_retrieve_the_rendering_fixture(self):
        calls,report,error=self.execute(instrument='FAILURES!!!\nTests run: 6, Failures: 1')
        self.assertIsNotNone(error);self.assertFalse(report['passed']);self.assertEqual(calls.count(('root',)),1);self.assertFalse(any(c[0]=='pull' for c in calls))
    def test_physical_profile_is_rejected_before_any_install_or_root(self):
        calls,report,error=self.execute(guest='0');self.assertIsNotNone(error);self.assertFalse(report['passed']);self.assertEqual(len(calls),1)
    def test_wrong_spotify_source_is_rejected_before_install_or_provision(self):
        calls,report,error=self.execute(valid_source=False);self.assertIsNotNone(error);self.assertFalse(report['passed']);self.assertFalse(any(c[0] in ('install','root','push') for c in calls))

if __name__=='__main__':unittest.main()
