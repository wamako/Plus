# R23 stabilization · suite 0.1.10 · Shuffle+ 0.1.12

## Implemented

- Queue edit paths rebuild commands from the observer's validated initial state.
  Metadata-only refreshes use live compare-and-set revisions and native objects,
  preserving history, delimiters and duplicate occurrence indices. Native CAS
  still rejects later races. No automatic mutation retry was added.
- Shuffle+ verifies full initial, completion, failure and reviewed checkpoints.
  Failed completion saves remain unknown; failed review saves display an error
  and keep the review control available. Storage errors cannot mask the native
  outcome or expose private details.
- Debug/Release addons use separate generated asset directories and matching
  native outputs. CI checks clean unsigned Release, then mixed builds, and
  compares each packaged addon to its own variant's compiled bytes.
- One manifest supplies module version/code, host, extension versions and About
  version. Shuffle+ requires observer-initial CAS capability. The incompatible
  upstream APK updater and its executor leak are removed; settings link to the
  compatibility candidate and explain manual update review.
- Install/update and local folder screens disclose fully trusted in-process
  execution. These notices do not provide isolation.
- Disabled glass avoids repeated view-tree scans, with one restore pass after
  disabling. Capture is coalesced and requires attached/shown/focused views.
  Destroyed activities are released from current-activity holders.
- Vendored legacy node_modules are removed from git; npm ci restores locked
  dependencies. The README now starts with this fork's installation and testing.

## Verification and limits

Test-first regressions reproduce stale CAS and dropped/stale journal checkpoints.
Queue fixtures enforce revisions and exercise asynchronous observers, duplicate
occurrences, current/history preservation, manual edits, no-op/refused/lost replies
and cleanup. Real-loader UI checks cover failed review acknowledgment and recovery.
PR2 records final CI/head, test counts and artifact hashes after validation.
Automated results do not establish authenticated phone acceptance.

## Deferred work

True extension isolation and a supported embedded Node port need separate design
and qualification; see [trust limits](../SECURITY.md) and
[Node assessment](NODE_RUNTIME_ASSESSMENT.md). No unqualified runtime is substituted.
Background state polling is retained to protect listening features until event
coverage can be profiled on the phone. Manager timer persistence needs recovery
semantics and Android lifecycle tests; existing presets/behavior are retained.
Follow [phone acceptance](../R23_ACCEPTANCE.md) for queue order, library writes and
Samsung glass. Reproduced code fixes do not prove every prior phone issue resolved.
