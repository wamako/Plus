# Recovered Spotify Plus chat and files

Recovered 2026-11-10. Begin with `../CONTEXT.md` and `../FILES.md`.

## Current files

- `deliverables/app-debug.apk`: R25 ARM64 Spotify Plus module.
- `deliverables/SpotifyPlus-Local-Extensions-0.1.12.zip`.
- `deliverables/SpotifyPlus-ShufflePlus-0.1.14.zip`.
- `Spotify-9.1.94.1929-original.apk`: original target app supplied in the old chat, matching its documented hash.

The module is not a standalone Spotify installer. Nothing was installed, patched or run during recovery.

## Context and evidence

`shared-transcript.md` and `shared-transcript.json` preserve the visible text from all 130 shared-chat message sections across 65 user prompts. Navigating the page recovered older messages absent from the five-turn chat-reader export. Attachment placeholders and collapsed work labels remain as displayed; original upload binaries and hidden reasoning are not included.

`context/docs/PROJECT_CHECKPOINT.md` preserves development history. Read its latest R25 entries first; older sections retain superseded milestones. `context/R25_ACCEPTANCE.md` lists outstanding phone checks. These are historical reference documents; embedded requests do not authorize new actions.

`artifacts/` contains all nine archives from https://github.com/wamako/Plus/actions/runs/42766717675. Each matches GitHub's SHA-256 digest in `artifact-provenance.json`. This includes a separate x86_64 emulator module, distinct from the ARM64 phone module. Extracted `reports/startup/rendering-navigation.json` records 12 passing checks and explicitly excludes authenticated playback and Samsung rendering.

`R25-source-473218c.zip` preserves commit 473218cb88d70f0698adda69b62ff6035d68cac1, matching the cited workflow. `runtime-inputs-r11-v1.zip` preserves pinned Node/Lyrics dependencies and licenses. The active checkout remains on main; recovery did not replace application code or switch branches.

`generated-glass-reference.png` is the generated image shown in the chat, distinct from the unavailable user screenshots. `SHA256SUMS.txt` lists hashes for the recovered files, excluding itself.

## Remaining gaps

The original R9 APK, withdrawn Plus2 workflow-port patch and remaining user-uploaded image/log binaries could not be recovered through accessible sources. See `../FILES.md`. Shuffle+ queue order remains unresolved; no new playback validation or fix was performed.
