# Recovery update — 2026-11-10

The initial missing-file list below is historical. The following files are now recovered under `recovered/`:

| Item | Local path under recovered/ | Verification |
| --- | --- | --- |
| R25 ARM64 module | deliverables/app-debug.apk | Exact cited workflow artifact |
| Local Extensions 0.1.12 | deliverables/SpotifyPlus-Local-Extensions-0.1.12.zip | Tested extension packages artifact |
| Shuffle+ 0.1.14 | deliverables/SpotifyPlus-ShufflePlus-0.1.14.zip | Tested extension packages artifact |
| All nine build archives | artifacts/ | Every archive matches its GitHub SHA-256 digest |
| R25 source | R25-source-473218c.zip | Commit 473218cb88d70f0698adda69b62ff6035d68cac1, matching the workflow |
| Full visible chat | shared-transcript.json and shared-transcript.md | All 130 message sections across 65 user prompts |
| Detailed historical checkpoint and acceptance notes | context/ | From the matching source commit |
| Generated glass reference | generated-glass-reference.png | Shared-page image; not a user screenshot |
| Retained Node/Lyrics inputs | runtime-inputs-r11-v1.zip | SHA-256 d43b7b250bf7cd1fca0f66000d21f4c6e1d64780bf5a59d80df7b4a997065c4a |
| Original Spotify APK | Spotify-9.1.94.1929-original.apk | SHA-256 a0a6fbe6b87249bd3de88f16b342cce233f94513d41a0f6f2a06558ba51a9304; 153798178 bytes |
| Startup/rendering evidence | reports/ | Extracted from the cited run; includes 12 passing instrumentation checks |

Source run: https://github.com/wamako/Plus/actions/runs/42766717675
Archive provenance: `recovered/artifact-provenance.json`. All local recovery hashes: `recovered/SHA256SUMS.txt`.

Still unavailable: R9 APK, withdrawn Plus2 workflow-port patch and remaining original uploaded screenshot/log binaries. The original Spotify APK and inline log text are recovered, but this does not restore every upload. Initial placeholder counts below came from a partial page and are not a complete inventory.

Library identities were reused across historical versions, according to the checkpoint. The recovered latest files are tied explicitly to the cited run and source commit; a Library ID alone does not establish the historical version.

---

## Initial recovery manifest (historical)
# File recovery manifest

Status as of 2026-11-10: links preserved; original binary files unavailable through the accessible conversation tools. The checked Library link requires a signed-in session. No APK, ZIP, patch, image, or original attachment was downloaded.

| Item | Preserved source | Status |
| --- | --- | --- |
| R25 ARM64 module APK | https://chatgpt.com/library?file_id=libfile_0f3bc659ca0c8191b84b3495b8654346&account_id=personal | Link recovered; binary missing |
| Local Extensions 0.1.12 ZIP | https://chatgpt.com/library?file_id=libfile_793721010b34819196727f0c12dacc16&account_id=personal | Link recovered; binary missing |
| Shuffle+ 0.1.14 ZIP | https://chatgpt.com/library?file_id=libfile_ef80c890d7208191a3a86fe4bc56a194&account_id=personal | Link recovered; binary missing |
| Plus2-R25-workflow-port.patch | https://chatgpt.com/library?file_id=libfile_acdd648b47a8819194eb3ff7edeeb2cc&account_id=personal | Link recovered; binary missing; workflow port later withdrawn |
| R9 APK | Shared page displayed Download R9 APK | No usable download target exposed |
| Original uploaded files | Shared page displayed 27 uploaded-file placeholders across four messages | Names and binaries unavailable |
| Original uploaded screenshots | Shared page displayed 15 uploaded-image placeholders across seven messages | Images unavailable |

The placeholder counts describe what was visible in the shared page, not a verified inventory of unique files. The conversation reader returned `attachments: []`.

## Imported text files

- `thread-export.json`: conversation reader response payload, preserving five returned turns.
- `CONTEXT.md`: context summary incorporating the accessible shared page and original conversation reader.
- `FILES.md`: this manifest of recovered references and missing binaries.

