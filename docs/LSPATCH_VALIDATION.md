# Android 17 / LSPatch validation on Linux

The default test host is **ubuntu-24.04**, using KVM and Google's stable
**Android 37.0 Google APIs x86_64** image. No Mac, self-hosted runner, device
subscription or additional runner label is required. `ANDROID37_RUNNER_LABEL`
is no longer used. The existing `RUN_LSPATCH_SMOKE` flag and `SPOTIFY_APK_URL`
secret still control the actual patched-Spotify test.

A separately labeled **lspatch-android15** job uses Google's API **35** image
with the same module and ARM64 translation checks. It is compatibility coverage;
it cannot establish Android 17 behavior or satisfy the API 37 profile. Both
profiles are explicit, with no automatic downgrade. API 35 reports use
**LSPatch-Android15-Linux-Reports** and record required/observed API 35.

The Linux environment job passed in
[CI run 42309629517](https://github.com/wamako/Plus/actions/runs/42309629517): real
API 37 guest boot, ARM64 bridge/ABI/ISA checks, and explicit translated/native
scope. The build and all 49 checks passed at
`167edd9518455f8d4635741c2d548b09740f94da`. Spotify startup was skipped there
because the then-configured APKMirror source returned HTTP 403.

The guest OS runs x86_64; Spotify and Plus native code run as **ARM64 through
Google's native bridge**. This is explicitly translated compatibility coverage,
not native ARM64 execution or a Samsung firmware test. A passing emulator boot
is separate from a passing Spotify startup. No executable app or extension
source is changed to make this CI profile work.

## Coverage

| Job | Evidence required |
| --- | --- |
| build | Pinned API-2 preparation, JVM/native protocol fixtures, JS/TypeScript/loader regressions, Android build and packaged DEX/native checks |
| android17-environment | Real Linux/KVM guest boot, API 37, x86_64 guest, advertised ARM64 ABI, `libndk_translation.so` bridge and ARM64-to-x86_64 ISA mapping |
| lspatch-packaging | Exact original APK hash, unchanged embedded original/module, matching LSPatch loader/framework, manifest/target SDK and APK v2 signature |
| lspatch-android17 | Actual patched Spotify installed with `--abi arm64-v8a`, confirmed installed ABI, two stable starts, Plus entry, Node readiness, Shuffle+ production loader, native bridge/runtime mappings and read-only extracted code |
| Separate acceptance | Native ARM/Samsung firmware, account/login, audible playback, real queue order/history, timers, extension UI and visual alignment |

The environment job runs independently of the build/APK download. A bad source
therefore cannot hide whether Linux can boot the guest. The startup job waits
for the build, source/package verification and proven guest/translation checks.
It downloads the same-run Plus module and Shuffle+ artifacts and patches again
inside its own private temporary directory. Original/patched Spotify APKs are
never published as workflow artifacts.

## Why Linux works differently

[GitHub supports KVM-accelerated Android emulators on hosted Linux runners](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/).
The workflow grants its runner user access to the disposable VM's `/dev/kvm`
and requires `emulator -accel-check` to succeed. This uses an x86_64 guest, not
full-system ARM emulation. The Google APIs image supplies the ARM native bridge;
[AOSP's published image properties](https://android.googlesource.com/platform/prebuilts/android-emulator-build/system-images/+/refs/heads/main/generic/system-images/android-35/google_apis/x86_64/build.prop)
illustrate this configuration. The test checks the **actual API 37 guest's**
properties and refuses to install if ARM64 translation is absent. It neither
installs a third-party translator nor changes guest properties to pretend support.

The exact image package is `system-images;android-37.0;google_apis;x86_64`.
The structured image check refuses a different API, ABI, minor release or
preview channel. Official Linux SDK tools 23.0/build 16111833 are downloaded
with Google's published SHA-1 `e025545c62a8e64c7559119566a569fb1dec5f60`.
Inventory: [tools](https://dl.google.com/android/repository/repository2-4.xml),
[images](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-5.xml).
Each guest boot has a 10-minute deadline and the job a 30-minute limit.

The former hosted-Mac attempt failed with `HV_UNSUPPORTED`. Its native QEMU
backend probes were inconclusive. Those historical checks do not establish an
Android boot; the current Linux workflow replaces that default entirely.
The original native-ARM harness profile remains available for explicit local
use, but is not required by any default workflow job.

## Enable actual patched-Spotify startup

The user has already enabled the flag and configured the secret. Keep:

1. **RUN_LSPATCH_SMOKE=true** in [Actions variables](https://github.com/wamako/Plus/settings/variables/actions).
2. **SPOTIFY_APK_URL** in [Actions secrets](https://github.com/wamako/Plus/settings/secrets/actions):
   a CI-accessible HTTPS source for the original monolithic Spotify
   **9.1.94.1929**, code **147600575**, SHA-256
   `a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304`.
3. Push to the project PR or rerun failed jobs after updating the source.
   Manual workflow dispatch also supports a checkbox once present on the
   default branch. Fork PRs never receive this source secret.

The connector cannot read/change secret values. Setting presence is reported as
a boolean only. APKMirror pages are supported when their single `download-link`
anchor leads to the same provider's HTTPS file handler. Resolution uses a
fresh cookie session and at most one page-to-file request, with no ad/script
following or insecure redirects. The downloaded APK must still match the exact
pinned hash. Expired links and provider HTTP denials are not bypassed; use a
working direct HTTPS APK source if that provider refuses CI downloads.

Public Google Drive sharing links (`https://drive.google.com/file/d/FILE_ID/view`)
are also supported. The downloader requests the same file's public export and
follows at most one large-file confirmation form. It accepts only Google's
HTTPS download destination, GET method, the original file ID and known download
fields. Sign-in pages, permission walls, other files/destinations, duplicate
fields and ambiguous forms are refused; permissions are never changed. The
exact original APK checksum remains mandatory. The sharing URL belongs in
`SPOTIFY_APK_URL`, not in a public workflow or repository file. No Drive login
or API key is needed for an anonymously downloadable file.

The user-supplied Drive source was downloaded locally and matched the pinned
153,798,178-byte original APK exactly. This establishes file identity and local
download access, not CI access or actual Spotify startup. After updating the
secret, CI must verify the source again and run the gated startup test.

`input.json` reports only fixed file categories, byte counts/hashes and recognized
Spotify version fields, or an HTTP status for failed requests. URLs, temporary
keys, headers, cookies and response bodies are never logged or uploaded.
Unexpected inputs are deleted before patching. A different APK/split/repack is
not silently accepted. The user's new APKMirror secret was retried; its request
failed before input verification. The Linux run will report any HTTP status
without exposing the link.

The independent environment artifact is **Android17-Linux-Environment-Report**;
startup results use **LSPatch-Android17-Linux-Reports**; packaging uses
**LSPatch-Package-Report**. All have 14-day retention. The final workflow summary
reports build, packaging, actual boot and startup separately. Missing reports,
skips and setup failures are never app passes.

## Disposable guest procedure

The harness refuses physical devices, multiple devices, the wrong API/profile,
and guests with Spotify already installed. A fresh AVD is wiped for each test.
The universal host APK is installed explicitly with `--abi arm64-v8a` and
`dumpsys package` must confirm `primaryCpuAbi=arm64-v8a` before fixture writes.
This prevents native-x86 Spotify startup from being misreported as ARM64 module
coverage.

Root ADB is used only to seed the built Shuffle+ extension into its production
installed-extension folder, restore ownership/SELinux labels and inspect native
mappings/file modes. ADB is unrooted before each app start. LSPatch uses its
integrated mode; no root framework/manager is installed.

Each of two launches requires integrated bootstrap, Plus entry, `Host ready`
and `Loaded script com.wamako.shuffleplus` evidence, followed by 15 seconds of
stable process life. Java/native crashes, link errors, writable code rejection
and loader failures are rejected. Node/JNI/addon mappings and read-only extracted
code are inspected; translated runs also require the native bridge mapped in
the actual Spotify process. LSPatch can map from `base.apk`, so a Linux map need
not include its ZIP member name. No source playlist/likes or queue is mutated.
No account credentials are used. Raw logcat, app data and UI dumps remain private
and are not artifacts.

## Completed offline test, 2026-11-06

`validation/r13-lspatch487-offline.json` records the actual delivered R13 module
test. LSPatch exited successfully, preserved Spotify target SDK **37**, raised
minimum SDK 24 to its required **28**, retained the original component factory
in config and embedded the module/original unchanged. Loader and ARM64 framework
match the pinned patcher. APK v2 signature verification passed with zero errors.

| Input | SHA-256 |
| --- | --- |
| Official LSPatch 1.2/487 JAR | `d238fdc414d121b7fa454d8b4ccf420df3a8c97d563761861ff92bd9c5da2165` |
| Delivered R13 module | `97efb28001c7e05b052c29a4d63ed6186d5b12fccf8ff1ed9bd4d37d5aaaafe7` |
| Original Spotify APK | `a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304` |

LSPatch intentionally links original entries inside a stored `origin.apk`.
Python ZipFile's anti-overlap guard refuses that enclosing entry. Its local
header, bounds, full size, CRC and original SHA are checked directly; all other
entries retain ZipFile overlap/CRC checks. Corruption tests exercise this reader.

This completed test is **offline packaging**, without an emulator/device launch.
It does not establish R13/Shuffle+ phone compatibility. The Linux device harness
is additional coverage that requires a downloadable original APK and verified
guest translation. These CI/tooling
changes do not change the delivered R13 APK or Shuffle+ 0.1.0 ZIP.

Reproduce offline checks with local inputs and JDK 21:

```bash
python3 -m pip install androguard==4.1.4
python3 tools/verify_lspatched_package.py --original /path/spotify.apk \
  --module /path/r13.apk --jar /path/lspatch-v1.2-487-release.jar \
  --patched /path/spotify-lspatched.apk
javac -proc:none -cp /path/lspatch-v1.2-487-release.jar -d /tmp/plus-verifier \
  tools/VerifyLspatchSignature.java
java -cp /tmp/plus-verifier:/path/lspatch-v1.2-487-release.jar \
  VerifyLspatchSignature /path/spotify-lspatched.apk
```

`--module-sha256` selects a fresh same-run module artifact instead of the
delivered R13 hash. Embedded bytes must still match that full input, and the
verifier requires the R13 manifest/version.

## Drive-enabled CI execution

At `f3d42a769a9bc21218d7e7f61822748ff9923260`, run
[42312473550](https://github.com/wamako/Plus/actions/runs/42312473550) passed all
52 checks (no skips), the module build, Linux environment and configured-source
LSPatch packaging/signature checks. The configured source is now usable.
The first startup job hit a closed SDK archive connection; its targeted retry
passed setup, booted API 37, installed ARM64 patched Spotify and provisioned
Shuffle+, then timed out waiting for module/Node/extension readiness. This is a
failed startup check, not an app/runtime pass. Two successful launches are not
established.

Failure diagnostics now record only fixed readiness flags, known exception/error
categories, native-link reason booleans and the test stage. The launch's global
buffer can be consulted in memory to correlate a terminated Spotify process;
only that process supplies error categories. Global marker flags are diagnostic
only and never satisfy startup. No raw logs, messages, URLs or file paths are
written to reports. A missing process fails after a 30-second grace period;
missing LSPatch/module entry fails after 60 seconds. Node/extension readiness
still has the configured deadline. These diagnostics do not change app code.

The next diagnostic run, 42314895848 at `94287750b12662bb67211813fe45b64b25ed07c4`,
passed all 55 checks/build/environment/package verification. On the first launch
its process log contained integrated-loader and Plus-module entry markers, but
no Node/Shuffle+ readiness, known exception or crash report. The name-only PID
lookup reported no process. This does not establish whether the app actually
exited or the lookup lost it. The harness now follows Android ActivityManager's
registered main process for user 0, verifies its `/proc` entry and refuses
ambiguous live candidates. It records only lookup counts/method, never process
dump content. Helper processes and other users cannot satisfy the main-process
check. A fresh execution must determine the actual runtime outcome.

Run 42316531323 at `8426fa193226e508107f1978976c1b97f1db143d` passed all 58
checks/build/environment/package verification. Startup again observed loader
and module entry but no ready Node/Shuffle+. ActivityManager lookup reported
zero registered/live main processes; no known Java/native crash was recorded.
This is not a successful app startup result.

After a failed patched launch, the harness now optionally reinstalls the exact
checksum-pinned **unmodified** APK as an isolated control on that same disposable
guest. It first tests ARM64 and, only if that fails, the original's native
x86_64 ABI. A control requires a registered process stable for 15 seconds and a
resumed Spotify activity; it performs no login or playback. It can run only
after this harness installed/provisioned the test app, and rechecks the guest
profile/hash before uninstalling that disposable instance. Its result remains
separate: a successful stock control never changes a failed patched verdict.
Only fixed markers/counts/booleans are retained, including whether Spotify was
resumed and whether process-dump identity shapes were present. Source and native
runtime binaries are unchanged by this control coverage.
