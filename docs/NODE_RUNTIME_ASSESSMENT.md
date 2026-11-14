# Embedded Node upgrade assessment

Reviewed 2026-11-09. No embedded runtime upgrade is included in the extension
0.1.8 / Shuffle+ 0.1.10 delivery. R21 remains compatible with these bundles.

## Evidence and recommendation

R21 embeds nodejs-mobile 18.20.4. The
[official latest mobile release](https://github.com/nodejs-mobile/nodejs-mobile/releases/tag/v18.20.4)
is still 18.20.4 (2024-10-07). Node 18's upstream maintenance ended 2025-04-30;
retaining the binary for this focused update does not make it supported.

The [official Node schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
lists Node 22 through 2027-04-30, Node 24 through 2028-04-30 and Node 26 through
2029-04-30. CI build tooling uses Node 22; the local complete extension and host
JavaScript checks passed on Node 24.22.1. These desktop checks establish JavaScript
compatibility only, not an Android embedding upgrade.

The mobile [Node 22 issue](https://github.com/nodejs-mobile/nodejs-mobile/issues/133)
and [Node 24 discussion](https://github.com/nodejs-mobile/nodejs-mobile/issues/152)
are open. [PR 151](https://github.com/nodejs-mobile/nodejs-mobile/pull/151) proposes
24.5.0 from `Acurast/nodejs-mobile` at
`b856357fb95b2af800e8613e242a70cdcb935743`; it is unmerged. Its author reports ARM
and ARM64 compilation and Android/iOS testing, but leaves the full mobile suite
unchecked and reports failures in the existing test harness. Android x86_64 is
not listed in that compilation checklist. An old 24.5.0 experiment is not a
current security-patched runtime qualification.

A separate Node 24 source-build investigation is the most concrete next step
because a mobile patchset exists. Rebase the mobile patches onto a current
supported 24.x patch release; inspect ownership, patch maintenance and reproducible
builds before treating the fork as a dependency. Node 26 offers a longer support
window, but needs its own mobile port assessment. Neither is a verified drop-in
replacement today. Do not switch production binaries or bump host requirements
until both ABIs and the following gates pass.

## Compatibility gates before implementation

1. Produce matching headers and shared libraries for ARM64 phones and the x86_64
   emulator from the same pinned source/toolchain, with license notices, digests,
   Android minimum SDK and 16 KB page-size compatibility recorded.
2. Rebuild the JNI host and `spotifyplus_bridge.node`. This project uses direct
   `node::Start`, `node::MultiIsolatePlatform`, V8 isolates, task runners and worklet
   APIs, so replacing `libnode.so` alone is insufficient. Check API changes,
   module ABI, linker dependencies, shutdown, callbacks and thread ownership.
3. Pass host/SDK, native bridge, UI/worklet, marketplace/settings, all extension
   regressions and actual-loader profiles on the candidate runtime. Exercise
   fetch/TLS, cancellation, binary serialization, storage and reload behavior.
4. Rebuild both Android profiles, run packaged-DEX/native checks and every actual
   Android instrumentation fixture, then pass both logged-out patched-Spotify
   launches and persistent storage/journal/shuffle probes on a fresh API37 AVD.
5. Test the rebuilt ARM64 runtime on the Samsung phone, including rendering,
   background/resume, Beautiful Lyrics native integration, authenticated playback,
   queue observations and safe playlist/queue mutation outcomes. Compare memory,
   responsiveness and crashes against R21; retain a rollback module.

No Android Node 24 binary was installed or tested in this work. This assessment
identifies a candidate and concrete acceptance gates; it does not claim runtime
support or phone compatibility for the experimental port.
