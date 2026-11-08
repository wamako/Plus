#!/usr/bin/env python3
"""Production glass capture/drawable and Spotify intent resolution, without login."""
import argparse,hashlib,json,pathlib,re,subprocess

MODEL_SHA="a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304"

def run(*args,timeout=180):
    return subprocess.run(['adb',*map(str,args)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--module',type=pathlib.Path,required=True);parser.add_argument('--tests',type=pathlib.Path,required=True);parser.add_argument('--spotify-model-apk',type=pathlib.Path,required=True);parser.add_argument('--report',type=pathlib.Path,required=True);args=parser.parse_args()
    report={'test_kind':'production_glass_and_spotify_intent_resolution','passed':False,'authenticated_playback_tested':False,'samsung_rendering_tested':False}
    args.report.parent.mkdir(parents=True,exist_ok=True)
    try:
        for name,wanted in [('ro.kernel.qemu','1'),('ro.build.version.sdk','37'),('ro.product.cpu.abi','x86_64')]:
            if run('shell','getprop',name).stdout.decode().strip()!=wanted:raise RuntimeError('Unsupported disposable test profile')
        with args.spotify_model_apk.open('rb') as source:
            if hashlib.file_digest(source,'sha256').hexdigest()!=MODEL_SHA:raise RuntimeError('Unexpected Spotify model source')
        run('install','-r',args.module);run('install','-r',args.tests)
        uid_text=run('shell','pm','list','packages','-U','com.lenerd46.spotifyplus').stdout.decode()
        uids=re.findall(r'(?m)^package:com\.lenerd46\.spotifyplus uid:([1-9]\d{4,5})[ \t]*$',uid_text)
        if len(uids)!=1:raise RuntimeError('Could not resolve isolated fixture owner')
        uid=uids[0];directory='/data/user/0/com.lenerd46.spotifyplus/files';model=directory+'/spotify-model.apk'
        run('root');run('wait-for-device')
        run('shell','mkdir','-p',directory);run('shell','chown',uid+':'+uid,directory)
        run('push',args.spotify_model_apk,model);run('shell','chown',uid+':'+uid,model);run('shell','chmod','0444',model)
        run('unroot');run('wait-for-device')
        if run('shell','id','-u').stdout.decode().strip()!='2000':raise RuntimeError('Instrumentation requires non-root ADB')
        classes='com.lenerd46.spotifyplus.features.GlassRenderingTest,com.lenerd46.spotifyplus.api2.NavigationIntentsTest,com.lenerd46.spotifyplus.api2.NativeQueueModelTest'
        result=run('shell','am','instrument','-w','-e','class',classes,'com.lenerd46.spotifyplus.test/androidx.test.runner.AndroidJUnitRunner',timeout=240)
        output=result.stdout.decode('utf-8','replace')
        if not re.search(r'(?m)^OK \(6 tests\)\s*$',output) or 'FAILURES' in output or 'INSTRUMENTATION_FAILED' in output:
            # This runner only executes our synthetic, logged-out fixtures.
            # Fixed test/exception names help diagnose failures without logs.
            report['failure_categories']=[name for name in ['AssertionError','ClassNotFoundException','NoClassDefFoundError','VerifyError','SecurityException','NoSuchMethodException','ExceptionInInitializerError','IOException'] if name in output]
            report['failed_fixture_methods']=re.findall(r'(?m)^\d+\) ([A-Za-z]+)\(',output)
            raise RuntimeError('Android rendering/navigation instrumentation did not pass')
        report.update(instrumentation_passed=True,tests_passed=6)
        # run-as cannot reliably read FUSE-backed external app files on API37.
        # All app launches/tests above ran with non-root ADB. Elevate only after
        # those checks, on the verified disposable AVD, to retrieve our own
        # synthetic fixture. Never read a Spotify screenshot or app data.
        run('root');run('wait-for-device')
        output=args.report.with_name('glass-fixture.png')
        run('pull','/sdcard/Android/data/com.lenerd46.spotifyplus/files/glass-fixture.png',output)
        image=output.read_bytes()
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):raise RuntimeError('Missing synthetic rendering artifact')
        run('shell','rm','-f',model)
        report.update(spotify_model_queue_command_verified=True,passed=True,tests_passed=6,foreground_exclusion=True,repeated_capture=True,actual_blur=True,failed_capture_restores_state=True,spotify_track_intent_resolved=True,unsafe_links_rejected=True)
    finally:
        args.report.write_text(json.dumps(report,indent=2)+'\n');print('ANDROID_UI_REPORT '+json.dumps(report,sort_keys=True))

if __name__=='__main__':main()
