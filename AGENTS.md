# Repository environment setup

For tasks that need Linux user-mode foreign-architecture emulation, see
[docs/LINUX_EMULATION_SETUP.md](docs/LINUX_EMULATION_SETUP.md). Check availability
with `bash tools/setup_linux_emulation.sh --check`; install with
`bash tools/setup_linux_emulation.sh` only when needed and administrator access
is available. Do not change sudo, sandbox, or host kernel configuration to work
around missing privileges. These packages are optional for ordinary repository
reviews and do not replace Android emulator validation.
