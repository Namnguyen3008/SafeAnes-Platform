from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import tempfile
from typing import Any, BinaryIO, Callable


OFFICIAL_VITALDB_API = "https://api.vitaldb.net"


@dataclass(frozen=True)
class StoredVitalDBRecord:
    case_id: int
    path: Path
    sha256: str
    size_bytes: int
    download_time_utc: str


def build_official_case_uri(case_id: int | str, dataset_version: str) -> str:
    normalized_id = _validated_case_id(case_id)
    if not re.fullmatch(r"\d+\.\d+\.\d+", dataset_version):
        raise ValueError("dataset version must be a numeric dotted version")
    return f"{OFFICIAL_VITALDB_API}/{dataset_version}/{normalized_id}.vital"


def _validated_case_id(case_id: int | str) -> int:
    if isinstance(case_id, bool):
        raise ValueError("case_id must be a positive VitalDB integer")
    try:
        normalized = int(case_id)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("case_id must be a positive VitalDB integer") from exc
    if normalized <= 0 or str(normalized) != str(case_id).strip().lstrip("+"):
        raise ValueError("case_id must be a canonical positive VitalDB integer")
    return normalized


class ImmutableVitalDBStore:
    """Write-once raw VitalDB records validated by the VitalDB parser."""

    def __init__(
        self,
        root: str | Path,
        *,
        validator: Callable[[Path], Any] | None = None,
        vitaldb_module: Any | None = None,
    ) -> None:
        self.root = Path(root).expanduser().resolve()
        self.raw_dir = self.root / "raw"
        if validator is None:
            if vitaldb_module is None:
                try:
                    import vitaldb as vitaldb_module
                except ImportError as exc:
                    raise RuntimeError("VitalDB Python package is required to validate raw files") from exc
            validator = self._vital_file_validator(vitaldb_module)
        self.validator = validator

    @staticmethod
    def _vital_file_validator(vitaldb_module: Any) -> Callable[[Path], None]:
        def validate(path: Path) -> None:
            vital_file = vitaldb_module.VitalFile(str(path), header_only=True)
            names = vital_file.get_track_names()
            if not names or not float(vital_file.dtend) > float(vital_file.dtstart):
                raise ValueError("VitalDB format validation failed: missing tracks or duration")

        return validate

    def store_stream(
        self,
        case_id: int | str,
        stream: BinaryIO,
        *,
        source_uri: str,
        chunk_size: int = 1024 * 1024,
    ) -> StoredVitalDBRecord:
        normalized_id = _validated_case_id(case_id)
        if chunk_size < 1024:
            raise ValueError("chunk_size must be at least 1024 bytes")
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        destination = self.raw_dir / f"{normalized_id}.vital"
        if destination.exists():
            raise FileExistsError(f"raw VitalDB case {normalized_id} is immutable and already exists")

        digest = hashlib.sha256()
        byte_count = 0
        fd, temporary_name = tempfile.mkstemp(
            dir=self.raw_dir, prefix=f".{normalized_id}.", suffix=".vital"
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(fd, "wb") as target:
                while True:
                    block = stream.read(chunk_size)
                    if not block:
                        break
                    if not isinstance(block, bytes):
                        raise TypeError("VitalDB download stream must return bytes")
                    target.write(block)
                    digest.update(block)
                    byte_count += len(block)
                target.flush()
                os.fsync(target.fileno())
            if byte_count == 0:
                raise ValueError("VitalDB download returned an empty file")
            if self.validator(temporary_path) is False:
                raise ValueError("VitalDB format validation failed")
            # Hard-link creation is atomic and fails if another process already wrote this ID.
            os.link(temporary_path, destination)
            now = datetime.now(timezone.utc).isoformat()
            return StoredVitalDBRecord(
                case_id=normalized_id,
                path=destination,
                sha256=digest.hexdigest(),
                size_bytes=byte_count,
                download_time_utc=now,
            )
        finally:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
