#!/usr/bin/env python3
"""Check core hook signatures against an APK; does not replace on-device tests.

Install androguard==4.1.4, then run: python tools/verify_spotify_apk.py /path/to/spotify.apk
No APK bytes or decompiled Spotify code are written to the repository.
"""
import argparse
import hashlib
import re
import zipfile
from collections import defaultdict

from loguru import logger
from androguard.core.apk import APK
from androguard.core.dex import DEX


def params(descriptor):
    return re.findall(r"\[*L[^;]+;|\[*[ZBCSIJFD]", descriptor.split(")")[0][1:].replace(" ", ""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk")
    args = parser.parse_args()
    logger.disable("androguard")
    apk = APK(args.apk)
    if apk.get_package() != "com.spotify.music":
        raise SystemExit("Expected the Spotify APK")
    print("Spotify", apk.get_androidversion_name(), "build", apk.get_androidversion_code(), flush=True)
    with open(args.apk, "rb") as source:
        print("SHA-256", hashlib.file_digest(source, "sha256").hexdigest(), flush=True)
    title = apk.get_android_resources().get_res_id_by_key(
        "com.spotify.music", "string", "sidedrawer_link_settings")
    classes, strings, factories = {}, defaultdict(set), []
    with zipfile.ZipFile(args.apk) as archive:
        for entry in archive.namelist():
            if not entry.endswith(".dex"):
                continue
            dex = DEX(archive.read(entry))
            for cls in dex.get_classes():
                methods = []
                for method in cls.get_methods():
                    item = dict(name=method.get_name(), desc=method.get_descriptor(),
                                flags=method.get_access_flags(), strings=set(), calls=[])
                    is_factory = False
                    for ins in method.get_instructions() if method.get_code() else []:
                        op = ins.get_op_value()
                        if op in (0x1A, 0x1B):
                            value = dex.get_cm_string(ins.get_ref_kind())
                            item["strings"].add(value)
                            strings[value].add(cls.get_name())
                        if op in (0x14, 0x15) and title in ins.get_literals():
                            is_factory = True
                        if method.get_name() in ("invoke", "invokeSuspend") and op in (*range(0x6E, 0x73), *range(0x74, 0x79)):
                            owner, name, desc = dex.get_cm_method(ins.get_ref_kind())
                            item["calls"].append((owner, name, "".join(desc)))
                    methods.append(item)
                    if is_factory:
                        factories.append(item)
                classes[cls.get_name()] = dict(methods=methods, flags=cls.get_access_flags(),
                    fields=[(f.get_name(), f.get_descriptor(), f.get_access_flags()) for f in cls.get_fields()])
            print("Indexed", entry, flush=True)

    def owners(*anchors):
        return set.intersection(*(strings[a] for a in anchors))

    def one(label, values):
        values = set(values)
        if len(values) != 1:
            raise AssertionError(f"{label}: expected one match, got {sorted(values)}")
        value = next(iter(values))
        print("PASS", label, value, flush=True)
        return value

    # Follow the same factory -> content -> row -> coroutine chain as the hook.
    content = one("Settings row content", (owner for f in factories for owner, name, desc in f["calls"]
        if name == "<init>" and len(params(desc)) == 7
        and params(desc)[1:3] == ["Ljava/lang/Integer;", "Ljava/lang/String;"]
        and params(desc)[-1] == "I"))
    row = one("Settings row wrapper", (n for n, c in classes.items() for m in c["methods"]
        if m["name"] == "<init>" and len(params(m["desc"])) == 3
        and params(m["desc"])[:2] == ["I", content]))
    one("Settings list builder", (n + "#" + m["name"] for n, c in classes.items() for m in c["methods"]
        if m["name"] == "invokeSuspend" and any(o == row and method == "<init>" for o, method, _ in m["calls"])))

    item_type = one("Modern context-menu model", (n for n in owners(
        "Exactly one title property must be populated.", "Exactly one icon property must be populated.")
        if any(m["name"] == "<init>" and len(params(m["desc"])) == 9
            and params(m["desc"])[3:6] == ["Ljava/lang/Integer;", "Ljava/lang/String;", "Ljava/lang/Integer;"]
            for m in classes[n]["methods"])))
    fields = [f for f in classes[item_type]["fields"] if not f[2] & 8]
    assert len(fields) == 9, "Unexpected menu item field layout"
    action_fields = [f for f in classes[fields[8][1]]["fields"] if not f[2] & 8]
    assert len(action_fields) == 4, "Unexpected menu action field layout"
    assert classes[action_fields[3][1]]["flags"] & 0x200, "Expected callback interface"
    print("PASS menu callback interface", action_fields[3][1], flush=True)

    request = one("HTTP builder", owners("method.isEmpty() == true",
        " must not have a request body.", " must have a request body."))
    writers = [m for m in classes[request]["methods"] if params(m["desc"]) ==
        ["Ljava/lang/String;", "Ljava/lang/String;"] and m["desc"].endswith(")V")]
    assert writers, "No token-header writers"
    print("PASS header writers", [m["name"] for m in writers], flush=True)
    one("HTTP URL writer", (m["name"] for m in classes[request]["methods"]
        if params(m["desc"]) == ["Ljava/lang/String;"] and {"ws:", "wss:"} <= m["strings"]))

    setters = [(n, m) for n, c in classes.items() for m in c["methods"] if
        {"spotify.settings.esperanto.proto.Settings", "SetPrivateSession"} <= m["strings"]
        and len(params(m["desc"])) == 2 and m["desc"].endswith(")Ljava/lang/Object;")]
    one("Coroutine private-session setter", (n + "#" + m["name"] for n, m in setters))
    continuation = params(setters[0][1]["desc"])[1]
    assert {m["name"] for m in classes[continuation]["methods"]} >= {"getContext", "resumeWith"}
    one("Empty coroutine context", (n for n in owners("EmptyCoroutineContext") if len(classes[n]["fields"]) == 1))
    value = classes[params(setters[0][1]["desc"])[0]]
    assert any(m["flags"] & 8 and params(m["desc"]) == ["Z"] for m in value["methods"])
    prefs = one("Playback preference service", owners("Failed to get preference with key %s"))
    assert any(m["desc"].endswith(")Lio/reactivex/rxjava3/core/Completable;")
        and len(params(m["desc"])) == 2 and "Ljava/lang/String;" in params(m["desc"])
        for m in classes[prefs]["methods"])
    one("Lyrics-line renderer", (n + "#" + m["name"] for n, c in classes.items() for m in c["methods"]
        if {"fontScale", "lyrics line color"} <= m["strings"] and m["desc"].endswith(")V")))
    print("PASS: core APK signature checks. On-device feature tests are still required.", flush=True)


if __name__ == "__main__":
    main()
