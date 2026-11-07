#!/usr/bin/env bash
# The emulator action invokes this whole file as one command.
set -euo pipefail
: "${RUNNER_TEMP:?Missing job temporary directory}"
: "${DEVICE_PROFILE:?Missing explicit emulator test profile}"
case "${SPOTIFYPLUS_RUN_PATCHED_HOST:-}" in
  true|false) ;;
  *) echo 'Expected an explicit patched-host boolean' >&2; exit 2 ;;
esac

python3 tools/run_lspatch_smoke.py --device-profile "$DEVICE_PROFILE" \
  --check-environment --report "$RUNNER_TEMP/smoke-reports/environment.json"
if [ "$SPOTIFYPLUS_RUN_PATCHED_HOST" = true ]; then
  python3 tools/run_lspatch_smoke.py --device-profile "$DEVICE_PROFILE" \
    --apk "$RUNNER_TEMP/lspatch-smoke/spotify-lspatched.apk" \
    --extension "$RUNNER_TEMP/shuffle-extension/shuffle-plus" \
    --original-control "$RUNNER_TEMP/lspatch-smoke/spotify-original.apk" \
    --report "$RUNNER_TEMP/smoke-reports/startup.json" --timeout 360
fi
