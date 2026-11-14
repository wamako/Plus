Sources: LeNerd46/spotify-plus, commit 49d0a665def1f73862c774aff4815d7ed4d4b375.
script-scheduler.ts and ScriptImageView.java are copied unchanged, under LICENSE.
ScriptImageLoader.java adapts the same ImageDecoder approach, preserves the API 27
static fallback, bounds downloads/decoding, and leaves SVG out of this focused port.
The pinned c407383 source used during preparation has identical relevant inputs.
