# Optional Linux user-mode emulation tools

The repository records how to install `qemu-user-static` and `binfmt-support`.
Installed system packages belong to the execution environment, so a new chat or
runner may need to run setup again. No package binaries are checked into Git.

On Debian/Ubuntu:

```bash
bash tools/setup_linux_emulation.sh --dry-run
bash tools/setup_linux_emulation.sh
bash tools/setup_linux_emulation.sh --check
```

Installation requires root or configured, noninteractive sudo. The script uses
`cloud-agent-packages` when provisioned, otherwise APT. It preserves inherited
proxy/CA settings, skips installation when both packages are present, and fails
with instructions when administrator access is unavailable. An environment
owner can also install the packages in the reusable environment image or setup
configuration. Repository instructions alone cannot grant administrator access.

`qemu-user-static` runs compatible foreign-architecture Linux executables.
Automatic dispatch additionally depends on kernel binfmt_misc support and
container/host permissions. Installing these packages does not itself enable
privileged registration, KVM, an Android system image, or Android APK execution.
Keep the existing Android validation workflow for APK/emulator testing.
