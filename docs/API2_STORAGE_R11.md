# R11 API-2 storage repair

R10 did not copy or initialize the pinned API-2 `StorageHook`. The native addon
routed preference and file operations to the `storage` handler name, but that
handler was absent. Writes silently returned and reads returned null. Extension
0.1.6's read-back checks correctly exposed the missing host wiring.

R11 copies the pinned production handler and registers it before the first
Activity resume can start Node. This restores the host's existing private,
per-extension preference and file APIs, including keys, account options,
metadata caches and write journals. No extension sandbox permissions are widened.
The module version is `0.10.0-api2.9.1.94.11` (version code 28).

Use R11 as the Spotify Plus module in LSPatch and repatch Spotify 9.1.94.1929.
Keep the local 0.1.6 extension folders. A ZIP refresh cannot add a missing native
Java handler to an already-patched Spotify installation. Save the settings again
once the updated module is active; values that R10 never wrote cannot be recovered.

The package verifier now requires the storage class in the outer APK's DEX files.
The regression suite checks source selection/startup ordering and executes the
actual generated StorageHook on a JVM with test Android interfaces and real
temporary files. It covers registration, JSON/string/boolean storage, private
namespaces, a fresh context, removal, private/cache files and path confinement.
These are build/JVM checks, not a physical Android or LSPatch test.
