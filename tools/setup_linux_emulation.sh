#!/usr/bin/env bash
# Optional Linux user-mode emulation tools. Run once per fresh environment.
set -euo pipefail
packages=(qemu-user-static binfmt-support)
mode=${1:-install}
case "$mode" in
  --check)
    missing=0
    for package in "${packages[@]}"; do
      if [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) != 'install ok installed' ]]; then
        printf 'Missing package: %s\n' "$package" >&2
        missing=1
      fi
    done
    exit "$missing"
    ;;
  --dry-run)
    printf '%s\n' 'Packages: qemu-user-static binfmt-support' \
      'Install using the cloud package helper when available, otherwise apt-get.' \
      'Administrator access is required; existing proxy and CA settings are preserved.'
    exit 0
    ;;
  install) ;;
  *) printf 'Usage: bash %s [--check|--dry-run]\n' "$0" >&2; exit 2 ;;
esac
if bash "$0" --check >/dev/null 2>&1; then
  printf '%s\n' 'Linux emulation packages are already installed.'
  exit 0
fi
installer=(apt-get)
if [[ -x /usr/local/bin/cloud-agent-packages ]]; then
  installer=(/usr/local/bin/cloud-agent-packages)
fi
if [[ $(id -u) != 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    printf '%s\n' 'Installation requires root or configured sudo. Ask the environment owner to install these packages or add them to the environment image.' >&2
    exit 1
  fi
  installer=(sudo -n "${installer[@]}")
fi
"${installer[@]}" update
# The scoped cloud helper accepts package names only, without APT options.
if [[ -x /usr/local/bin/cloud-agent-packages ]]; then
  "${installer[@]}" install "${packages[@]}"
else
  "${installer[@]}" install -y "${packages[@]}"
fi
bash "$0" --check
