# Android 17 / LSPatch validation

The project adapts `wamako/android-ci-template` revision
`7d1ca34a8d3b25c9a8049dc2c876817190845a83` in
`.github/workflows/s24-validation.yml`. After the build and enabled source/package
checks succeed, an environment invocation checks host virtualization and attempts
the AVD. Invalid APK inputs are rejected before starting another slow guest.
The patched-host invocation runs
**after** preparing the pinned API-2 runtime, compiling the native addon,
checking local extensions, running regressions and verifying the APK. The device
job downloads the same-run module and Shuffle+ artifacts rather than rebuilding
a different module or running the stock package-name instrumentation test.

## Coverage and limits

| Check | What it establishes |
| --- | --- |
| Existing build job | Pinned runtime preparation, JVM/native protocol fixtures, JS/TypeScript/host-loader regressions, Android build and packaged DEX/native checks |
| Android 17 environment job | Host virtualization capability; on supported runners, official emulator boot and observed API 37/arm64-v8a. Unsupported hosts explicitly report no boot. Does not install Spotify. |
| Independent LSPatch packaging job | Validates the configured private APK source and exact hash, original/module embedded unchanged, manifest/target SDK, matching loader/ARM64 framework, framework/API/Vector versions and APK v2 signature. Does not require a running emulator. |
| Device startup job | Actual patched Spotify installation, two starts, Plus entry, Node ready, Shuffle+ production loader, mapped native libraries/addon and read-only extracted code |
| Separate acceptance needed | Samsung firmware, login/account authorization, extension UI interaction, audible playback, real queue order/history, timers and visual alignment |

The device job uses API **37**, **arm64-v8a**, integrated LSPatch **1.2 (487)**,
Xposed API **102**, Vector **canary-3106 (7306)** at
`e00c5c5038bbcc14e0b382ab893301d6993e6989`. Signature bypass is the CLI default
**0**, with no target SDK override or injected-Dex/debug flag. The phone's exact
patch options have not been supplied; matching versions is not identical settings.

`macos-14` is Intel in the [runner image inventory](https://github.com/actions/runner-images#available-images).
The adapted job uses standard Apple Silicon `macos-15` and asserts `uname -m`
is `arm64`. Google's SDK inventory publishes the platform/image as **37.0**:
`system-images;android-37.0;google_apis;arm64-v8a`, not `android-37`. The workflow
uses that exact stable package and official ARM64 macOS command-line tools 23.0
(build 16111833), checksum-checked against Google's published inventory. The
older setup action defaults to tools 16.0 and its old macOS archive naming;
`tools/setup_android37_sdk.py` installs the current architecture-specific tools.
References: [platform/tools inventory](https://dl.google.com/android/repository/repository2-4.xml)
and [system-image inventory](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-5.xml).
A missing runner/image, failed boot or absent evidence fails the device job;
there is no lower-API/x86 fallback. This is a generic AVD, not a Samsung ROM.

GitHub documents **no nested virtualization on its hosted ARM Macs**
([runner limitations](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#limitations-for-arm64-macos-runners)).
The hardware probe therefore never treats a hosted Mac as a usable hypervisor.
When patched testing is enabled, the workflow now tries **software CPU emulation**
on that runner instead: `-accel off` with `ANDROID_I_WANT_MY_TCG=yes`.
[Google documents this opt-in](https://developer.android.com/studio/run/emulator-commandline)
as unsupported and very slow. Each boot is bounded to 15 minutes; the job is
bounded to 45 minutes. The guest must still prove API 37 and ARM64. No API/ABI
substitution occurs. Reports identify `software` versus `hardware` execution.

Only the optional environment-only software experiment can continue after an
emulator failure. It writes `software_boot_failed` and `passed:false`; the
patched-host job is then skipped. A requested Spotify startup failure always
fails its job. `boot-result.json` requires the actual guest report, rather than
treating an action's success exit code as Android evidence. A boot result never
establishes Spotify startup; that requires the separate `startup.json` report.

If the software trial fails or is too slow, the reliable alternative is a
trusted, ephemeral runner on a **physical Apple Silicon Mac** with usable
Hypervisor.framework. Set **ANDROID37_RUNNER_LABEL** to its runner label. Leave
this variable unset to use the hosted software trial; creating a GitHub label
does not provision a physical machine. The setup script currently supports
macOS ARM64. Custom-runner jobs reject fork PRs.

## Enable patched-Spotify testing

The environment harness itself needs no APK source. Enabling patched testing also
enables the bounded hosted software trial; a separate Mac is not required to
attempt it. The patched-host job is eligible only after a real AVD boot succeeds.
A successful AVD boot alone is not a Spotify startup pass.

1. In [Plus Actions secrets](https://github.com/wamako/Plus/settings/secrets/actions),
   add **SPOTIFY_APK_URL**, an HTTPS download URL accessible to CI for the
   **original monolithic Spotify 9.1.94.1929 APK**, version code `147600575`, SHA-256
   `a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304`.
   A different repack/split APK is rejected. Use a private or time-limited source;
   do not commit the APK or signed URL.
2. In [Plus Actions variables](https://github.com/wamako/Plus/settings/variables/actions),
   set **RUN_LSPATCH_SMOKE** to **true** to enable trusted same-repository PR and
   main-push runs. Fork PRs cannot receive this secret.
3. Push a commit to the project PR, or rerun its build run. Once the workflow
   exists on the default branch, **Run workflow** also offers a
   **run_lspatch_smoke** checkbox. Manual runs default to build/regressions and
   the environment-only check.
4. Inspect **lspatch-android17 / android17-validation** and the
   **LSPatch-Android17-ARM64-Reports** artifact. The validation summary explicitly
   reports a skipped device job as **not tested**.

Configure these values through repository settings; the GitHub connector does
not expose settings management. CI reports only whether the APK source secret
is present and whether the enable flag is true, never the URL itself.
A local input file is not a remotely downloadable CI source.
Until the secret and enable flag are set, no patched-Spotify startup result can
be claimed. The separate **Android17-ARM64-Environment-Report** artifact records
only the host/emulator environment check. An unsuccessful software trial is
not a device or Spotify pass.

The **lspatch-packaging** job runs after the build independently of the emulator
outcome when testing is enabled. Its **LSPatch-Package-Report** artifact verifies
the configured source/package even if the software boot cannot complete. No
original/patched Spotify APK is uploaded. Real startup still requires both a
successful package check and a proven guest boot.

If the configured URL returns unexpected bytes, **input.json** records only
byte count, SHA-256 and a fixed type classification. For recognized Spotify APKs
it includes version/code/target SDK and whether LSPatch is already embedded.
It distinguishes HTML download pages, other ZIPs, the Plus module and actual
Spotify APKs without recording page content, ZIP member names, headers or URLs.
The unexpected download is deleted and never patched. The exact checksum guard
is retained; a different build is not silently accepted.

Google's command-line tools now forward `sdkmanager` to the newer Android CLI,
whose `--list` table format changed. The exact-image preflight parses Google's
structured XML inventory with `tools/check_android37_image.py`; it does not infer
image absence from a CLI display format.

Build preparation retains the checksum-verified R11 Node/Lyrics donor from the
Actions artifact/cache (`API2_PLAYLIST_R12.md`). It fails instead of replacing
the pinned runtime if the donor is unavailable.

## Emulator procedure

The harness refuses physical devices, multiple devices, other API/ABI pairs,
and AVDs where Spotify is already installed. The action wipes a disposable AVD,
installs integrated patched Spotify and seeds the built Shuffle+ extension in
its ordinary installed-extension directory. Root ADB provisions the fixture,
restores ownership/SELinux labels, and inspects native mappings/modes. **ADB is
unrooted before each launch**; Plus loads through integrated LSPatch with no root
framework/manager dependency. This fixture does not change phone installation.

The harness requires production log evidence: Plus entry, `Host ready`, and
`Loaded script com.wamako.shuffleplus`. Known Java/native/linker/host/loader
failures are rejected. The same process must remain alive for 15 seconds after
readiness. Integrated LSPatch bootstrap and Node/JNI/addon mappings/read-only code are
checked, then the test repeats after a force-stop to exercise existing caches.
It does not click Shuffle+ controls or submit queue/playlist mutations.

LSPatch's library is loaded from inside the APK, so Linux maps may name only
`base.apk`. The framework is checked by its actual integrated-bootstrap and
module-entry logs; only the extracted Node/JNI/addon files require named mappings.

Only structured checks/hashes are uploaded, for 14 days. Raw logcat, UI dumps,
original/patched APKs, app data, URLs and credentials stay out of artifacts.
No Spotify login/token or Last.fm key is needed.

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
It does not establish R13/Shuffle+ phone compatibility. The new device harness
is additional coverage to run once its input is configured. These CI/tooling
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
