# Extension trust and runtime limits

Local and marketplace extensions are **fully trusted code running inside Spotify**.
Node VM contexts and module restrictions are compatibility controls, not a
security boundary. Extensions may access the Spotify session, private app data,
network and native bridge. Native plugins share the app process too.

Only load source and authors you trust. Repository/version information identifies
a source; it is not a security review or signature guarantee. Updates change code
and need the same trust as an installation. Selecting or refreshing a local folder
executes its code. The relevant settings and install/update screens disclose this.

Do not share passwords, session tokens, API keys, original Spotify APKs or private
logs in issues. Use the redacted module diagnostics. Inspect an unknown playlist
or shuffle result in Spotify before retrying, even after a success acknowledgment.

## Architectural work remaining

A genuine boundary requires a separate Android process, restricted IPC,
capability-scoped operations and a native plugin migration path. R23 does not
provide that isolation. Missing elevated flags do not make code safe.

The embedded Node 18.20.4 runtime is past upstream support. A supported Android
port needs qualification of JNI/V8 interfaces, both ABIs, rendering, storage and
Beautiful Lyrics. See [the runtime assessment](docs/NODE_RUNTIME_ASSESSMENT.md).
CI's Node toolchain version is separate from the runtime embedded in the APK.
