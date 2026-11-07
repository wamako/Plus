#!/usr/bin/env python3
"""Production glass capture/drawable and Spotify intent resolution, without login."""
import argparse,json,pathlib,re,subprocess

def run(*args,timeout=180):
    return subprocess.run(['adb',*map(str,args)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--module',type=pathlib.Path,required=True);parser.add_argument('--tests',type=pathlib.Path,required=True);parser.add_argument('--report',type=pathlib.Path,required=True);args=parser.parse_args()
    report={'test_kind':'production_glass_and_spotify_intent_resolution','passed':False,'authenticated_playback_tested':False,'samsung_rendering_tested':False}
    args.report.parent.mkdir(parents=True,exist_ok=True)
    try:
        for name,wanted in [('ro.kernel.qemu','1'),('ro.build.version.sdk','37'),('ro.product.cpu.abi','x86_64')]:
            if run('shell','getprop',name).stdout.decode().strip()!=wanted:raise RuntimeError('Unsupported disposable test profile')
        run('install','-r',args.module);run('install','-r',args.tests)
        classes='com.lenerd46.spotifyplus.features.GlassRenderingTest,com.lenerd46.spotifyplus.api2.NavigationIntentsTest'
        result=run('shell','am','instrument','-w','-e','class',classes,'com.lenerd46.spotifyplus.test/androidx.test.runner.AndroidJUnitRunner',timeout=240)
        output=result.stdout.decode('utf-8','replace')
        if not re.search(r'(?m)^OK \(5 tests\)\s*$',output) or 'FAILURES' in output or 'INSTRUMENTATION_FAILED' in output:
            # This runner only executes our synthetic, logged-out fixtures.
            # Fixed test/exception names help diagnose failures without logs.
            report['failure_categories']=[name for name in ['AssertionError','ClassNotFoundException','NoClassDefFoundError','VerifyError','SecurityException'] if name in output]
            report['failed_fixture_methods']=re.findall(r'(?m)^\d+\) ([A-Za-z]+)\(',output)
            raise RuntimeError('Android rendering/navigation instrumentation did not pass')
        image=run('exec-out','run-as','com.lenerd46.spotifyplus','cat','/sdcard/Android/data/com.lenerd46.spotifyplus/files/glass-fixture.png').stdout
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):raise RuntimeError('Missing synthetic rendering artifact')
        args.report.with_name('glass-fixture.png').write_bytes(image)
        report.update(passed=True,tests_passed=5,foreground_exclusion=True,repeated_capture=True,actual_blur=True,failed_capture_restores_state=True,spotify_track_intent_resolved=True,unsafe_links_rejected=True)
    finally:
        args.report.write_text(json.dumps(report,indent=2)+'\n');print('ANDROID_UI_REPORT '+json.dumps(report,sort_keys=True))

if __name__=='__main__':main()
