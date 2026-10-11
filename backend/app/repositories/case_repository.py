from __future__ import annotations

import hashlib
import json
import math
from collections import OrderedDict
from pathlib import Path
import re
import threading
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, case_not_found


_CASE_ID = re.compile(r"^[1-9][0-9]*$")


def normalize_case_id(value: str | int) -> str:
    text = str(value)
    if not _CASE_ID.fullmatch(text):
        raise case_not_found(text)
    return text


class CaseRepository:
    """Reads the selected case catalog and metadata from trusted local files."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = threading.RLock()
        self._catalog: dict[str, Any] | None = None
        self._checksum_cache: dict[str, tuple[int, int, str]] = {}
        self._manifest_cache: OrderedDict[str, tuple[tuple[int, int, int], dict[str, Any]]] = OrderedDict()

    @property
    def catalog_ready(self) -> bool:
        try:
            self._load_catalog()
            return True
        except ApiServiceError:
            return False

    @property
    def dataset_cache_status(self) -> dict[str, Any]:
        """Report catalog presence and cache file availability without loading signals."""
        try:
            cases = self.list_cases()["cases"]
        except ApiServiceError:
            return {"status": "NOT_READY", "cached_case_count": 0, "catalog_case_count": 0}
        cached_count = sum(
            1
            for row in cases
            if row["cache_status"] == "READY"
            and (self.settings.vitaldb_root / "manifests" / f"{row['case_id']}.json").is_file()
        )
        return {
            "status": "READY" if cached_count else "EMPTY",
            "cached_case_count": cached_count,
            "catalog_case_count": len(cases),
        }

    def _load_catalog(self) -> dict[str, Any]:
        with self._lock:
            if self._catalog is not None:
                return self._catalog
            path = self.settings.catalog_path
            if not path.is_file():
                raise cache_not_ready("VitalDB case catalog is missing from the configured data root")
            try:
                catalog = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise cache_not_ready("VitalDB case catalog cannot be read") from exc
            if not isinstance(catalog, dict) or not isinstance(catalog.get("cases"), list):
                raise cache_not_ready("VitalDB case catalog has an invalid structure")
            self._catalog = catalog
            return catalog

    def list_cases(self) -> dict[str, Any]:
        catalog = self._load_catalog()
        cases: list[dict[str, Any]] = []
        for row in catalog["cases"]:
            try:
                case_id = normalize_case_id(row.get("case_id", ""))
                duration = float(row["duration_seconds"])
                if not math.isfinite(duration) or duration <= 0:
                    continue
            except (KeyError, TypeError, ValueError, ApiServiceError):
                continue
            raw_path = self.settings.vitaldb_root / "raw" / f"{case_id}.vital"
            cases.append({
                "case_id": case_id,
                "duration_seconds": duration,
                "available_signals": [str(item) for item in row.get("available_signals", [])],
                "uc04_eligible": bool(row.get("uc04_eligible", False)),
                "uc05_eligible": bool(row.get("uc05_eligible", False)),
                "coverage_summary": _dict_or_empty(row.get("coverage_summary")),
                "number_of_valid_windows": _dict_or_empty(row.get("number_of_valid_windows")),
                "inference_readiness": _dict_or_empty(row.get("inference_readiness")),
                "cache_status": "READY" if (raw_path.is_file() or (self.settings.vitaldb_root / "manifests" / f"{case_id}.json").is_file()) else "CACHE_NOT_READY",
            })
        return {
            "dataset": str(catalog.get("dataset", "VitalDB")),
            "dataset_version": str(catalog.get("dataset_version", "NOT_RECORDED")),
            "cases": cases,
        }

    def get_case(self, case_id: str | int) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        catalog = self._load_catalog()
        row = next(
            (item for item in catalog["cases"] if str(item.get("case_id")) == normalized),
            None,
        )
        if row is None:
            raise case_not_found(normalized)
        manifest = self.get_manifest(normalized)
        recording = _dict_or_empty(manifest.get("recording"))
        try:
            duration = float(recording.get("duration_seconds", row["duration_seconds"]))
        except (KeyError, TypeError, ValueError, OverflowError) as exc:
            raise cache_not_ready(f"VitalDB case {normalized} has invalid recording metadata") from exc
        if not math.isfinite(duration) or duration <= 0:
            raise cache_not_ready(f"VitalDB case {normalized} has invalid recording duration")
        return {
            "case_id": normalized,
            "dataset": str(manifest.get("dataset", catalog.get("dataset", "VitalDB"))),
            "dataset_version": str(manifest.get("source_dataset_version", catalog.get("dataset_version", "NOT_RECORDED"))),
            "source": str(manifest.get("source", "NOT_RECORDED")),
            "source_uri": manifest.get("source_uri"),
            "duration_seconds": duration,
            "patient_context": _dict_or_empty(manifest.get("patient_context")),
            "eligibility": _dict_or_empty(manifest.get("eligibility")),
            "available_signals": [
                str(item.get("track_name"))
                for item in manifest.get("available_tracks", [])
                if isinstance(item, dict) and item.get("track_name")
            ],
            "raw_file": {
                "sha256": _dict_or_empty(manifest.get("raw_file")).get("sha256"),
                "size_bytes": _dict_or_empty(manifest.get("raw_file")).get("size_bytes"),
                "immutable": _dict_or_empty(manifest.get("raw_file")).get("immutable", False),
                "cache_status": self._raw_cache_status(normalized),
            },
        }

    def _raw_cache_status(self, case_id: str) -> str:
        try:
            self.raw_path(case_id)
            return "READY"
        except ApiServiceError:
            return "CACHE_NOT_READY"

    def get_manifest(self, case_id: str | int) -> dict[str, Any]:
        """Return a verified source manifest; repository consumers must treat it as immutable."""
        normalized = normalize_case_id(case_id)
        manifest_dir = (self.settings.vitaldb_root / "manifests").resolve()
        path = (manifest_dir / f"{normalized}.json").resolve()
        if not _is_within(path, manifest_dir) or not path.is_file():
            raise cache_not_ready(f"VitalDB case {normalized} manifest is missing")
        try:
            stat = path.stat()
        except OSError as exc:
            raise cache_not_ready(f"VitalDB case {normalized} manifest cannot be read") from exc
        signature = (stat.st_mtime_ns, stat.st_size, getattr(stat, "st_ino", 0))
        with self._lock:
            cached = self._manifest_cache.get(normalized)
            if cached is not None and cached[0] == signature:
                self._manifest_cache.move_to_end(normalized)
                # Repository consumers treat this parsed source manifest as
                # read-only. Reusing it avoids repeatedly copying track
                # metadata for every signal in a replay chunk.
                return cached[1]
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise cache_not_ready(f"VitalDB case {normalized} manifest cannot be read") from exc
        if not isinstance(manifest, dict) or str(manifest.get("case_id")) != normalized:
            raise cache_not_ready(f"VitalDB case {normalized} manifest is invalid")
        with self._lock:
            self._manifest_cache[normalized] = (signature, manifest)
            self._manifest_cache.move_to_end(normalized)
            limit = max(1, self.settings.signal_file_cache_entries)
            while len(self._manifest_cache) > limit:
                self._manifest_cache.popitem(last=False)
        return manifest

    def get_track(self, case_id: str | int, track_name: str) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        manifest = self.get_manifest(normalized)
        track = next(
            (
                item
                for item in manifest.get("available_tracks", [])
                if isinstance(item, dict) and item.get("track_name") == track_name
            ),
            None,
        )
        if track is None:
            raise ApiServiceError(
                "TRACK_NOT_AVAILABLE",
                f"Track {track_name} is not available for case {normalized}",
                status_code=404,
            )
        return _track_metadata(track)

    def list_tracks(self, case_id: str | int) -> list[dict[str, Any]]:
        normalized = normalize_case_id(case_id)
        manifest = self.get_manifest(normalized)
        return [
            _track_metadata(item)
            for item in manifest.get("available_tracks", [])
            if isinstance(item, dict) and item.get("track_name")
        ]

    def raw_path(
        self,
        case_id: str | int,
        *,
        verify_checksum: bool = True,
        allow_missing: bool = False,
    ) -> Path:
        normalized = normalize_case_id(case_id)
        manifest = self.get_manifest(normalized)
        raw = _dict_or_empty(manifest.get("raw_file"))
        relative = raw.get("relative_path")
        expected_hash = raw.get("sha256")
        if not isinstance(relative, str) or not relative:
            raise cache_not_ready(f"VitalDB case {normalized} has no local raw-file manifest entry")
        raw_root = (self.settings.vitaldb_root / "raw").resolve()
        candidate = (self.settings.vitaldb_root / relative).resolve()
        if not _is_within(candidate, raw_root):
            raise cache_not_ready(f"VitalDB case {normalized} raw file path is invalid")
        if not candidate.is_file():
            if allow_missing:
                return candidate
            raise cache_not_ready(f"VitalDB case {normalized} raw file is missing from the local cache")
        if verify_checksum:
            self._verify_checksum(normalized, candidate, expected_hash)
        return candidate

    def ensure_raw_cached(self, case_id: str | int) -> Path:
        normalized = normalize_case_id(case_id)
        manifest = self.get_manifest(normalized)
        raw = _dict_or_empty(manifest.get("raw_file"))
        relative = raw.get("relative_path")
        expected_hash = raw.get("sha256")
        if not isinstance(relative, str) or not relative:
            raise cache_not_ready(f"VitalDB case {normalized} has no local raw-file manifest entry")
        raw_root = (self.settings.vitaldb_root / "raw").resolve()
        candidate = (self.settings.vitaldb_root / relative).resolve()
        if not _is_within(candidate, raw_root):
            raise cache_not_ready(f"VitalDB case {normalized} raw file path is invalid")
        if not candidate.is_file():
            try:
                import urllib.request
                candidate.parent.mkdir(parents=True, exist_ok=True)
                download_url = manifest.get("source_uri") or f"https://api.vitaldb.net/1.0.1/{normalized}.vital"
                urllib.request.urlretrieve(download_url, str(candidate))
            except Exception as exc:
                raise cache_not_ready(f"VitalDB case {normalized} raw file could not be downloaded") from exc
        if expected_hash:
            self._verify_checksum(normalized, candidate, expected_hash)
        return candidate

    def _verify_checksum(self, case_id: str, path: Path, expected_hash: Any) -> None:
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash):
            raise cache_not_ready(f"VitalDB case {case_id} manifest has no valid raw checksum")
        stat = path.stat()
        with self._lock:
            cached = self._checksum_cache.get(case_id)
            if cached and cached[:2] == (stat.st_size, stat.st_mtime_ns):
                if cached[2].casefold() == expected_hash.casefold():
                    return
                raise cache_not_ready(f"VitalDB case {case_id} raw checksum mismatch")
            digest = hashlib.sha256()
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            actual = digest.hexdigest()
            self._checksum_cache[case_id] = (stat.st_size, stat.st_mtime_ns, actual)
            if actual.casefold() != expected_hash.casefold():
                raise cache_not_ready(f"VitalDB case {case_id} raw checksum mismatch")


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _track_metadata(track: dict[str, Any]) -> dict[str, Any]:
    def rate(value: Any) -> float | str:
        if value is None or value == "":
            return "NOT_RECORDED"
        try:
            number = float(value)
            return number if math.isfinite(number) and number > 0 else "NOT_RECORDED"
        except (TypeError, ValueError, OverflowError):
            return "NOT_RECORDED"

    def count(value: Any) -> int | str:
        if value is None or value == "":
            return "NOT_RECORDED"
        try:
            number = int(value)
            return number if number >= 0 else "NOT_RECORDED"
        except (TypeError, ValueError, OverflowError):
            return "NOT_RECORDED"

    valid_range = track.get("valid_time_range_seconds")
    if not (
        isinstance(valid_range, list)
        and len(valid_range) == 2
        and all(isinstance(value, (int, float)) and math.isfinite(float(value)) for value in valid_range)
    ):
        valid_range = "NOT_RECORDED"
    return {
        "track_name": str(track.get("track_name", "NOT_RECORDED")),
        "source_device": _not_recorded(track.get("source_device")),
        "track_type": _not_recorded(track.get("track_type")),
        "native_sample_rate_hz": rate(track.get("native_sample_rate_hz")),
        "observed_update_rate_hz": rate(track.get("observed_update_rate_hz")),
        "unit": _not_recorded(track.get("unit")),
        "record_count": count(track.get("record_count")),
        "native_sample_count": count(track.get("native_sample_count")),
        "valid_time_range_seconds": valid_range,
    }


def _not_recorded(value: Any) -> Any:
    if value is None or value == "":
        return "NOT_RECORDED"
    if isinstance(value, float) and not math.isfinite(value):
        return "NOT_RECORDED"
    return value
