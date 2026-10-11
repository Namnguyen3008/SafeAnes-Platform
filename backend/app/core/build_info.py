"""Non-secret backend identity for checkout provenance and release builds."""
from __future__ import annotations

from functools import lru_cache
import hashlib
import os
import re
from pathlib import Path


SERVICE_NAME = "safeanes-backend"


def validate_build_id(value: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,127}", value) is None:
        raise ValueError("SAFEANES_BUILD_ID must be a safe release ID of 1-128 ASCII characters")
    return value


def _fingerprint_sources(app_root: Path) -> str:
    digest = hashlib.sha256()
    for source in sorted(app_root.rglob("*.py"), key=lambda path: path.relative_to(app_root).as_posix()):
        name = source.relative_to(app_root).as_posix().encode("utf-8")
        content = source.read_bytes()
        # Length framing prevents filename/content boundary ambiguities. Neither
        # checkout location nor model/data content enters the fingerprint.
        digest.update(len(name).to_bytes(8, "big"))
        digest.update(name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


@lru_cache(maxsize=1)
def _default_build_id() -> str:
    return _fingerprint_sources(Path(__file__).resolve().parents[1])


def get_backend_build_id() -> str:
    explicit = os.environ.get("SAFEANES_BUILD_ID")
    if explicit is not None:
        return validate_build_id(explicit)
    return _default_build_id()
