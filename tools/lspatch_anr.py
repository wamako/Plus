"""Read only PID-correlated ANR data on the harness-owned disposable AVD."""
import re
import subprocess

def main_exit_blocks(text, pid):
    if not isinstance(text, str) or not pid or not re.fullmatch(r"[1-9]\d*", str(pid)):
        return []
    return [block for block in re.split(r"(?=ApplicationExitInfo(?:\s|:))", text)
            if re.search(r"\bpid=" + re.escape(str(pid)) + r"(?:\s|$)", block)
            and re.search(r"\bprocess=com\.spotify\.music(?:\s|$)", block)]

def trace_path(text, pid):
    for block in main_exit_blocks(text, pid):
        if re.search(r"\breason=6(?:\s|$)", block):
            match = re.search(r"\btrace=(/data/system/procexitstore/anr_[A-Za-z0-9_-]{1,120}\.gz)(?:\s|$)", block)
            if match:
                return match[1]
    return None

def summarize(text, pid):
    empty = {"main_thread_found": False, "java_frames": [], "native_library_frames": {}}
    if not isinstance(text, str) or not pid or not re.fullmatch(r"[1-9]\d*", str(pid)):
        return empty
    block = re.search(r"(?ms)^----- pid " + re.escape(str(pid)) + r" at [^\n]*-----\n(.*?)(?=^----- end|\Z)", text)
    if not block or not re.search(r"(?m)^Cmd line: com\.spotify\.music\s*$", block[1]):
        return empty
    main = re.search(r'(?ms)^"main"([^\n]*)\n(.*?)(?=^\s*$|^"|^----- end|\Z)', block[1])
    if not main:
        return empty
    frames = re.findall(r"(?m)^\s+at ((?:com\.lenerd(?:46)?\.spotifyplus|org\.luckypray\.dexkit|org\.lsposed\.lspatch|android\.app|android\.os|java\.lang|java\.util)\.[A-Za-z0-9_.$<>]+)\(", main[2])
    state = re.search(r"\b(Runnable|Native|Blocked|Waiting|TimedWaiting|Suspended)\b", main[1])
    return {"main_thread_found": True, "main_thread_state": state[1] if state else "unknown",
            "java_frames": frames[:24], "native_library_frames": {name: name in main[2]
            for name in ("libdexkit.so", "libart.so", "libnode.so", "libc.so", "liblspatch.so")}}

def collect(device, exit_info, pid):
    path = trace_path(exit_info, pid)
    if not path:
        return {"trace_available": False}
    try:
        device.root(True)
        result = summarize(device.shell("toybox", "zcat", path, timeout=20), pid)
        return {"trace_available": result["main_thread_found"], **result}
    except (RuntimeError, subprocess.SubprocessError, UnicodeError):
        return {"trace_available": False}
    finally:
        device.root(False)

def theme_symbol(log):
    """Only a known reflection log's bounded Java code identifiers."""
    if not isinstance(log, str):
        return None
    match = re.search(r"Material theme method: public static(?: final)? void ((?:p|androidx\.compose\.material3)\.[A-Za-z0-9_.$-]{1,140})\(([A-Za-z0-9_.$,\[\]-]{1,1200})\)", log)
    if not match:
        return None
    owner, _, name = match[1].rpartition(".")
    parameters = match[2].split(",")
    if len(parameters) not in (6, 7) or parameters[-1] != "int":
        return None
    return {"declaring_class": owner, "name": name, "parameters": parameters}
