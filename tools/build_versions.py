"""Shared build identity for the Android module, settings and local extensions."""
import json
from pathlib import Path

VERSIONS = json.loads((Path(__file__).resolve().parents[1] / 'build-versions.json').read_text())
