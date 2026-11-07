# Android 17 / LSPatch validation on Linux

## Verified default

The normal workflow runs entirely on **ubuntu-24.04/KVM**, using Google's stable
**Android 37.0 Google APIs x86_64** image, a separately built **native x86_64**
Spotify Plus module, and integrated official **LSPatch 1.2 (487), signature mode 2**.
No Mac, self-hosted runner, device subscription or additional runner label is needed.

This profile passed real patched-Spotify startup in
[run 42324266946, job 128258025276](https://github.com/wamako/Plus/actions/runs/42324266946/job/128258025276)
at `80035647f9d2b7f877c6dffd1799d263491e7fc8`. It completed **two launches**,
each with process-scoped LSPatch/Plus entry, Node readiness, Shuffle+ production
loader evidence, fifteen seconds of stability after readiness, mapped Node/JNI/addon
libraries, and read-only extracted native code.

The phone module is still built separately for **ARM64**. The x86_64 APK is an
**emulator-only artifact**. This is logged-out startup coverage; it does not establish
Samsung/native ARM behavior, login, audible playback, actual queue order, timers,
extension UI interaction or visual alignment.

The workflow selecting this default is
`559b51ba8fe4487e23153da061fa901d3f799abc`. It changes workflow selection and
documentation; executable module/extension source is identical to the successful
comparison run. See the PR's latest workflow for the final default-path rerun.

## Existing setup

The user has already enabled and configured:

1. `RUN_LSPATCH_SMOKE=true` in
   [Actions variables](https://github.com/wamako/Plus/settings/variables/actions).
2. `SPOTIFY_APK_URL` in
   [Actions secrets](https://github.com/wamako/Plus/settings/secrets/actions),
   pointing to the original monolithic Spotify **9.1.94.1929** APK.

The supplied Drive source now works in CI. No new secret or URL is required.
`ANDROID37_RUNNER_LABEL` is no longer used. Manual workflow dispatch also has a
patched-host checkbox once the workflow is available on the default branch.
Fork PRs never receive the source secret; automatic secret-backed testing is
restricted to trusted same-repository runs.

## Pipeline and artifacts

| Job | Evidence required |
| --- | --- |
| build | Pinned API-2 preparation, Python/JVM protocol fixtures, JS/TypeScript/production-loader regressions, Android unit/build and packaged DEX/native checks; default ARM64 phone module |
| build-emulator-x86 | Same-run prepared sources, pinned official matching-version Node library, native x86_64 JNI/addon compilation, DEX/native and Node hash verification |
| android17-environment | Real Linux/KVM guest boot; actual API37 and x86_64 profile evidence; no app-startup inference |
| lspatch-packaging | Exact original, ARM64 module bytes embedded unchanged, official framework/config, target37, signature mode2 and valid APK v2 signature |
| lspatch-android17 | Same-run emulator module and Shuffle+ artifacts; verified native x86_64/mode2 package; actual installed ABI, two stable starts, Plus/Node/Shuffle+ readiness, native mappings and read-only code |
| validation-scope | Reports build, source/package, guest, patched startup and optional diagnostics separately |

The environment job runs independently of the source download. The startup job
waits for the module builds, package verification and a proven guest, then patches
again in its own temporary directory. Original/patched Spotify APKs are never
uploaded as workflow artifacts.

Normal report artifacts have 14-day retention:

- `Environment-Android17-Native-x86-Sig2-Report`
- `LSPatch-Package-Report`
- `LSPatch-Android17-Native-x86-Sig2-Reports`

Artifacts are labeled by test kind, Android version, ABI and patch mode to avoid
collisions. The build artifacts `SpotifyPlus-Debug-APK` (ARM64 phone module) and
`SpotifyPlus-Emulator-x86_64-APK` are distinct. Do not install the emulator module
on the Samsung phone.

## Native runtime and exact inputs

| Input | SHA-256 |
| --- | --- |
| Original Spotify APK; 153,798,178 bytes, version code147600575 | `a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304` |
| Official LSPatch1.2/487 JAR | `d238fdc414d121b7fa454d8b4ccf420df3a8c97d563761861ff92bd9c5da2165` |
| Delivered ARM64 R13 module | `97efb28001c7e05b052c29a4d63ed6186d5b12fccf8ff1ed9bd4d37d5aaaafe7` |
| Preserved ARM64 Node library | `ce00e709fe6b84c5a57b48cbcba8549cf594d752d386a93a8b2c6b76fb9d021a` |
| Official nodejs-mobile18.20.4 Android archive | `bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af` |
| Emulator x86_64 Node library | `9acba7e26a1e864f13b78f1b7121773643f3f33a4c6a2fe7d4f63eb06d4d3af1` |

The framework is API102, Vector canary-3106/code7306,
`e00c5c5038bbcc14e0b382ab893301d6993e6989`. Its loader and both ARM64/x86_64
framework libraries must match the pinned official JAR. Config is integrated,
without injected DEX, debugging or SDK override. Target SDK37 is retained.
LSPatch raises the minimum SDK to28; this is checked explicitly.

The default Gradle ABI remains ARM64. Only the separate emulator job uses
`-PspotifyplusNativeAbi=x86_64`, whose version gains `-emulator-x86_64`.
`tools/prepare_emulator_node.py` verifies the official archive and library hashes,
ELF machine and Node version, and four byte-identical source headers before
installing only the x86_64 library. The ARM donor is never replaced. Official
Node notices are in `third_party/nodejs-mobile-18.20.4-LICENSE.txt` and included
in emulator assets. The JNI/addon are compiled from the pinned source.

Fresh CI modules can have different archive/signing metadata from the delivered
R13 file. The actual downloaded artifact hash is checked against its embedded
copy; the native Node hash, expected module version/ABI and packaged classes are
also checked. The delivered R13 phone APK and extension ZIPs are unchanged.

LSPatch intentionally links host entries inside a stored `origin.apk`. The
verifier checks that enclosing entry's bounded header, size, CRC and original
hash directly; other entries retain ZipFile overlap/truncation/CRC validation.
APK v2 signature verification is a separate Java check and must report zero errors.

## Source download and privacy

Public Google Drive sharing/export links and Google's fixed large-file confirmation
flow are supported. Only the original file ID, HTTPS Google GET destination and
known fields are accepted; sign-in pages, permission walls, duplicate fields,
ambiguous forms and other files/destinations are refused. APKMirror's observed
same-provider file anchor is also supported. Neither provider's access controls
are bypassed. A different APK, split, repack or HTML page is never silently accepted.

The source URL belongs only in the secret. Cookie sessions, signed URLs, headers,
response bodies and private file IDs are not logged or committed. `input.json`
exposes only fixed input categories, byte/hash/version metadata or an HTTP status.

Reports contain fixed readiness/error categories, bounded process counts, known
exception-type/frame groups and PID-correlated AOSP ApplicationExitInfo
reason/status numbers. Raw logcat, exception messages, UI dumps, account data,
APKs and private paths are not published.

## Disposable guest procedure

The harness refuses physical devices, multiple devices, incorrect API/profile and
guests with Spotify already installed. Every job uses a fresh wiped AVD.
Native x86_64 is installed explicitly with `--abi x86_64`, and package metadata
must confirm that ABI before fixture writes.

The selected Google image also advertises ARM64 compatibility because the existing
R13 API-2 eligibility guard checks it. The native profile does not require an
active ARM translator and does not claim translated or native ARM execution.
The separate translation profile instead forces `--abi arm64-v8a` and verifies
the bridge/ISA properties and actual mapped translator.

Root ADB is limited to extension fixture preparation and native mapping/mode
inspection. Ownership/SELinux labels are restored, and ADB is unrooted for each
launch. No root framework or manager is installed. No Spotify account or
playback/queue mutation is used.

Each launch requires all production markers in the selected app PID, followed by
15 seconds of stability. Java/native crashes, link/writable-code errors and
host/extension/plugin loader failures are rejected. Global log markers alone
cannot pass a startup. Missing reports, skipped jobs and guest boots are never
app passes. Process selection uses Android's exact user0 main ProcessRecord
identity and a live /proc entry, refusing helper/other-user/ambiguous candidates.

After a failed patched launch, an optional stock control removes only the
harness-owned disposable app and installs the exact pinned original. It requires
a stable process and resumed Spotify activity. A passing stock control cannot
change the failed patched verdict.

## Optional diagnostics and observed failures

The normal CI selection is the verified native x86_64/mode2 profile.
To request additional experiments, use the `run_lspatch_diagnostics` dispatch
checkbox alongside patched-host testing, or optionally set
`RUN_LSPATCH_DIAGNOSTICS=true`. No extra variable is needed for normal testing.

| Optional job | Explicit profile |
| --- | --- |
| lspatch-android17-arm-translation | API37, translated ARM64 module, mode2 |
| lspatch-android15 | API35, translated ARM64 module, mode2; separate compatibility experiment |
| lspatch-android17-native-x86-mode0 | API37, native x86_64 module, mode0 |

These jobs fail normally if they fail; there is no continue-on-error conversion.
Unrequested diagnostics are clearly reported as skipped. API35 can never satisfy
API37 coverage, and an x86 pass can never establish phone ARM compatibility.

In [comparison run42324266946](https://github.com/wamako/Plus/actions/runs/42324266946),
Android17 translated ARM with modes0/2 and native x86 with mode0 failed before
Node readiness with PID-correlated exit reason6 (ANR), one activity launch and
no Spotify deep-link loop. The matching stock controls passed. Android15 ARM
with mode0 reported host_failed/IllegalStateException, with a passing stock
control. This does not prove the exact ANR cause.

The same run's native x86/mode2 startup passed twice. The
[LSPatch Android app request](https://github.com/JingMatrix/LSPatch/blob/v1.2/manager/src/main/java/org/lsposed/lspatch/data/model/PatchRequest.kt)
defaults to2; its
[CLI](https://github.com/JingMatrix/LSPatch/blob/v1.2/patch/src/main/java/org/lsposed/patch/LSPatch.java)
defaults to0. No setting is assumed to match the user's phone.

Earlier [run42319302108](https://github.com/wamako/Plus/actions/runs/42319302108)
established passing stock ARM controls on API35/37; patched ARM startup failed.
[Run42322636521](https://github.com/wamako/Plus/actions/runs/42322636521) built the
isolated x86 module but also failed native x86/mode0 startup. These failures remain
evidence, not successful coverage. The old hosted-Mac attempt returned
HV_UNSUPPORTED and is no longer required.

## Direct reproduction

Use JDK21, Python3.12 with `androguard==4.1.4`, the built x86_64 module and
Shuffle+ folder, and a fresh disposable API37 Google x86_64 AVD:

```bash
python3 tools/prepare_lspatch_smoke.py \
  --module /path/to/emulator/app-debug.apk --module-abi x86_64 \
  --signature-bypass-level 2 --work /tmp/lspatch-smoke \
  --report /tmp/smoke-reports/package.json

SPOTIFYPLUS_SIGNATURE_BYPASS_LEVEL=2 python3 tools/run_lspatch_smoke.py \
  --device-profile linux-x86_64-native \
  --apk /tmp/lspatch-smoke/spotify-lspatched.apk \
  --extension /path/to/shuffle-plus \
  --original-control /tmp/lspatch-smoke/spotify-original.apk \
  --report /tmp/smoke-reports/startup.json --timeout 360
```

Supply `SPOTIFY_APK_URL` securely in the environment, without shell tracing.
The preparer and standalone verifier retain mode0 as their historical CLI default;
normal workflows always pass mode2 explicitly. The report records the actual
verified mode and ABI.

The official image is `system-images;android-37.0;google_apis;x86_64`.
The inventory check rejects a different API, minor release, ABI or preview channel.
Official SDK tools are checksum-verified. Guest boot has a ten-minute deadline
and each device job a thirty-minute limit. KVM access and acceleration are
checked before boot; no third-party translation package or forged ABI property
is installed.
