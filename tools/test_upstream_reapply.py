"""Reapplying a source backport must not inject its declaration a second time."""
from pathlib import Path
import tempfile
import unittest
from apply_upstream_updates import change

class BackportReapplyTests(unittest.TestCase):
    def test_declaration_anchor_inside_its_replacement_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'host-runtime.ts'
            old='const manifest = parseManifest(request?.manifest);'
            new=old+'\nconst repositorySource = parseExtensionSource(request.source);'
            path.write_text(old+'\n')
            change(path,old,new)
            first=path.read_bytes()
            change(path,old,new)
            self.assertEqual(path.read_bytes(),first)
            self.assertEqual(path.read_text().count('const repositorySource'),1)

    def test_unknown_source_shape_still_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'unknown.ts';path.write_text('unrelated source')
            with self.assertRaises(RuntimeError):change(path,'old declaration','new declaration')
            self.assertEqual(path.read_text(),'unrelated source')
