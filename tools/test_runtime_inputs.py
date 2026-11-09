"""Offline validation and atomic-cache tests for the retained runtime bundle."""
import copy
import hashlib
import pathlib
import stat
import tempfile
import unittest
import warnings
import zipfile

from runtime_inputs import ensure_bundle, install_bundle, verify_bundle


DONOR_SHA = "176aac1fec257cf18b7f2fc002f5cad2be2f9cc774a69694094e34555abb5df2"
NODE = "node/arm64-v8a/libnode.so"
URL = "https://github.com/wamako/Plus/releases/download/build-inputs-v1/runtime-inputs.zip"
PAYLOADS = {
    NODE: b"small independently hashed Node fixture\x00\x01",
    "lyrics/LICENSE": b"Fixture lyrics license\n",
    "lyrics/index.js": b"console.log('fixture');\n",
    "lyrics/manifest.json": b'{"api":2,"main":"index.js","id":"fixture.lyrics"}',
    "lyrics/lyrics.apk": b"small APK fixture, not an executable APK",
    "lyrics/assets/nested/notice.txt": "Nested caf\u00e9 fixture\n".encode(),
    "licenses/node/LICENSE.txt": b"Fixture Node license\n",
}
VALIDATION_ERRORS = (ValueError, RuntimeError, zipfile.BadZipFile)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class RuntimeInputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.sequence = 0

    def bundle(self, members=None, declared=None):
        """Calculate the fixture manifest independently of production helpers."""
        self.sequence += 1
        path = self.root / f"fixture-{self.sequence}.zip"
        members = list(PAYLOADS.items()) if members is None else members
        declared = PAYLOADS if declared is None else declared
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)  # Intentional duplicate-entry fixture.
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                for name, payload in members:
                    archive.writestr(name, payload)
        archive_bytes = path.read_bytes()
        spec = {
            "format": 1,
            "archive": {"url": URL, "sha256": sha256(archive_bytes), "size": len(archive_bytes)},
            "entries": {name: {"sha256": sha256(payload), "size": len(payload)}
                        for name, payload in declared.items()},
            "donor_sha256": DONOR_SHA,
        }
        return path, spec

    @staticmethod
    def tree(path):
        return {p.relative_to(path).as_posix(): p.read_bytes()
                for p in path.rglob("*") if p.is_file()}

    def test_valid_bundle_accepts_nested_lyrics_and_license_entries(self):
        path, spec = self.bundle()
        before = path.read_bytes()
        verify_bundle(path, spec)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(set(self.root.iterdir()), {path})

    def test_install_copies_exact_arm_donor_and_lyrics_without_changing_other_abis(self):
        path, spec = self.bundle()
        source, lyrics = self.root / "source", self.root / "lyrics-cache"
        arm = source / "app/libnode/bin/arm64-v8a/libnode.so"
        x86 = source / "app/libnode/bin/x86_64/libnode.so"
        arm.parent.mkdir(parents=True)
        x86.parent.mkdir(parents=True)
        arm.write_bytes(b"previous ARM donor")
        x86.write_bytes(b"existing x86 donor")

        install_bundle(path, source, lyrics, spec)

        self.assertEqual(arm.read_bytes(), PAYLOADS[NODE])
        self.assertEqual(x86.read_bytes(), b"existing x86 donor")
        expected = {name.removeprefix("lyrics/"): value for name, value in PAYLOADS.items()
                    if name.startswith("lyrics/")}
        self.assertEqual(self.tree(lyrics / "dist"), expected)
        self.assertEqual((lyrics / "LICENSE").read_bytes(), PAYLOADS["lyrics/LICENSE"])

    def test_archive_digest_mismatch_is_refused(self):
        path, spec = self.bundle()
        spec["archive"]["sha256"] = "0" * 64
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_archive_size_mismatch_is_refused(self):
        path, spec = self.bundle()
        spec["archive"]["size"] += 1
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_entry_digest_is_checked_even_when_the_archive_digest_matches(self):
        changed = {**PAYLOADS, "lyrics/index.js": b"tampered fixture script"}
        path, spec = self.bundle(list(changed.items()))
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_entry_size_is_checked_independently_of_its_digest(self):
        path, spec = self.bundle()
        spec["entries"]["lyrics/index.js"]["size"] += 1
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_missing_expected_entry_is_refused_with_an_otherwise_valid_archive(self):
        members = [(name, value) for name, value in PAYLOADS.items() if name != "lyrics/lyrics.apk"]
        path, spec = self.bundle(members)
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_extra_undeclared_entry_is_refused(self):
        path, spec = self.bundle([*PAYLOADS.items(), ("lyrics/extra.js", b"not declared")])
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_duplicate_entry_is_refused_even_if_its_bytes_are_identical(self):
        path, spec = self.bundle([*PAYLOADS.items(), (NODE, PAYLOADS[NODE])])
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_symlink_entry_is_refused_even_if_its_name_and_digest_match(self):
        link = zipfile.ZipInfo(NODE)
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        members = [(link if name == NODE else name, payload) for name, payload in PAYLOADS.items()]
        path, spec = self.bundle(members)
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_unsafe_declared_paths_are_refused_even_when_all_digests_match(self):
        escaped = self.root.parent / (self.root.name + "-escape.txt")
        self.addCleanup(lambda: escaped.unlink(missing_ok=True))
        for unsafe in ("../" + escaped.name, str(escaped), "lyrics/../../" + escaped.name,
                       "lyrics\\..\\" + escaped.name):
            with self.subTest(path=unsafe):
                declared = {**PAYLOADS, unsafe: b"declared unsafe payload"}
                path, spec = self.bundle(list(declared.items()), declared)
                with self.assertRaises(VALIDATION_ERRORS):
                    verify_bundle(path, spec)
        self.assertFalse(escaped.exists())

    def test_declared_paths_outside_lyrics_licenses_or_the_exact_arm_node_are_refused(self):
        for unsupported in ("node/x86_64/libnode.so", "node/arm64-v8a/extra.so", "other/LICENSE"):
            with self.subTest(path=unsupported):
                declared = {**PAYLOADS, unsupported: b"declared unsupported payload"}
                path, spec = self.bundle(list(declared.items()), declared)
                with self.assertRaises(VALIDATION_ERRORS):
                    verify_bundle(path, spec)

    def test_unknown_manifest_format_is_refused(self):
        path, spec = self.bundle()
        spec["format"] = 2
        with self.assertRaises(VALIDATION_ERRORS):
            verify_bundle(path, spec)

    def test_invalid_bundle_is_fully_verified_before_existing_inputs_are_touched(self):
        changed = {**PAYLOADS, "lyrics/lyrics.apk": b"tampered final payload"}
        path, spec = self.bundle(list(changed.items()))
        source, lyrics = self.root / "source", self.root / "lyrics-cache"
        arm = source / "app/libnode/bin/arm64-v8a/libnode.so"
        arm.parent.mkdir(parents=True)
        arm.write_bytes(b"verified previously installed donor")
        (lyrics / "dist").mkdir(parents=True)
        (lyrics / "dist/index.js").write_bytes(b"previous verified lyrics")
        (lyrics / "LICENSE").write_bytes(b"previous verified license")
        before = self.tree(source), self.tree(lyrics)

        with self.assertRaises(VALIDATION_ERRORS):
            install_bundle(path, source, lyrics, spec)

        self.assertEqual((self.tree(source), self.tree(lyrics)), before)

    def test_valid_cache_is_reused_without_a_download(self):
        path, spec = self.bundle()
        before = path.read_bytes()
        def forbidden(*args):
            self.fail("A validated cached bundle must not trigger a download")
        ensure_bundle(path, spec, download=forbidden)
        self.assertEqual(path.read_bytes(), before)

    def test_cache_miss_downloads_to_a_temporary_path_and_activates_verified_bytes(self):
        path, spec = self.bundle()
        cache = self.root / "cache" / "runtime-inputs.zip"
        calls = []
        def download(url, destination, expected_size):
            destination = pathlib.Path(destination)
            calls.append((url, expected_size))
            self.assertNotEqual(destination.resolve(), cache.resolve())
            self.assertFalse(cache.exists())
            destination.write_bytes(path.read_bytes())
            self.assertFalse(cache.exists())
        ensure_bundle(cache, spec, download=download)
        self.assertEqual(calls, [(URL, spec["archive"]["size"])])
        self.assertEqual(cache.read_bytes(), path.read_bytes())
        verify_bundle(cache, spec)

    def test_corrupt_existing_cache_is_refused_without_a_download(self):
        path, spec = self.bundle()
        path.write_bytes(b"corrupt existing cache")
        def forbidden(*args):
            self.fail("A corrupt existing cache must be rejected, not silently reused or replaced")
        with self.assertRaises(VALIDATION_ERRORS):
            ensure_bundle(path, spec, download=forbidden)
        self.assertEqual(path.read_bytes(), b"corrupt existing cache")

    def test_cache_hit_still_checks_entry_metadata_instead_of_only_the_archive_digest(self):
        path, spec = self.bundle()
        spec = copy.deepcopy(spec)
        spec["entries"][NODE]["sha256"] = "0" * 64
        with self.assertRaises(VALIDATION_ERRORS):
            ensure_bundle(path, spec, download=lambda *args: self.fail("No download expected"))

    def test_corrupt_download_never_becomes_the_active_cache(self):
        path, spec = self.bundle()
        cache = self.root / "runtime-inputs.zip"
        def download(_url, destination, _expected_size):
            pathlib.Path(destination).write_bytes(b"incomplete download")
        with self.assertRaises(VALIDATION_ERRORS):
            ensure_bundle(cache, spec, download=download)
        self.assertFalse(cache.exists())
        self.assertEqual(set(p for p in self.root.rglob("*") if p.is_file()), {path})

    def test_failed_download_does_not_activate_partial_bytes(self):
        path, spec = self.bundle()
        cache = self.root / "runtime-inputs.zip"
        def download(_url, destination, _expected_size):
            pathlib.Path(destination).write_bytes(path.read_bytes()[:15])
            raise OSError("offline fixture interrupted")
        with self.assertRaises((OSError, *VALIDATION_ERRORS)):
            ensure_bundle(cache, spec, download=download)
        self.assertFalse(cache.exists())
        self.assertEqual(set(p for p in self.root.rglob("*") if p.is_file()), {path})

    def test_invalid_download_does_not_replace_a_valid_destination_created_during_download(self):
        path, spec = self.bundle()
        cache = self.root / "runtime-inputs.zip"
        def download(_url, destination, _expected_size):
            # Another setup process completes while this cache-miss fetch is in flight.
            cache.write_bytes(path.read_bytes())
            pathlib.Path(destination).write_bytes(b"corrupt late download")
        with self.assertRaises(VALIDATION_ERRORS):
            ensure_bundle(cache, spec, download=download)
        self.assertEqual(cache.read_bytes(), path.read_bytes())
        verify_bundle(cache, spec)


if __name__ == "__main__":
    unittest.main()
