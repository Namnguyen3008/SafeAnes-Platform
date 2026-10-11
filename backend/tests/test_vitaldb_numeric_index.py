from __future__ import annotations

import hashlib
import json
from pathlib import Path

from backend.app.core.config import Settings
from backend.app.repositories.case_repository import CaseRepository
from backend.app.repositories.vitaldb_repository import VitalDBRepository


class _Track:
    type = 2
    srate = 2.0
    unit = "mmHg"
    dname = "SyntheticDevice"

    def __init__(self):
        self.iterations = 0

    @property
    def recs(self):
        self.iterations += 1
        return [
            {"dt": 1_000.0, "val": [10.0, 20.0, 30.0, 40.0]},
            {"dt": 1_002.0, "val": [50.0, 60.0]},
        ]


class _VitalFile:
    def __init__(self, _path, track_names=None):
        self.dtstart = 1_000.0
        self.track = _Track()
        self.trks = {"Solar8000/ART_MBP": self.track}


class _VitalDb:
    VitalFile = _VitalFile


def _repository(tmp_path: Path) -> tuple[VitalDBRepository, _Track]:
    settings = Settings(data_root=tmp_path / "data", model_root=tmp_path / "model")
    raw_dir = settings.vitaldb_root / "raw"
    manifests_dir = settings.vitaldb_root / "manifests"
    raw_dir.mkdir(parents=True)
    manifests_dir.mkdir(parents=True)
    raw_path = raw_dir / "1.vital"
    raw_path.write_bytes(b"immutable waveform-window test")
    checksum = hashlib.sha256(raw_path.read_bytes()).hexdigest()
    track = {
        "track_name": "Solar8000/ART_MBP",
        "source_device": "Solar8000",
        "track_type": "NUMERIC",
        "native_sample_rate_hz": 2.0,
        "observed_update_rate_hz": 2.0,
        "unit": "mmHg",
        "valid_time_range_seconds": [0.0, 3.0],
    }
    catalog = {
        "dataset": "VitalDB",
        "dataset_version": "1.0.1",
        "cases": [{
            "case_id": "1",
            "duration_seconds": 5.0,
            "available_signals": [track["track_name"]],
            "uc04_eligible": False,
            "uc05_eligible": False,
            "coverage_summary": {},
            "number_of_valid_windows": {"uc04": 0, "uc05": 0},
            "inference_readiness": {"uc04": "BLOCKED", "uc05": "BLOCKED"},
            "raw_file_sha256": checksum,
        }],
    }
    settings.catalog_path.parent.mkdir(parents=True)
    settings.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    manifest = {
        "case_id": "1",
        "dataset": "VitalDB",
        "source_uri": "local-test-fixture",
        "recording": {"duration_seconds": 5.0},
        "raw_file": {"relative_path": "raw/1.vital", "sha256": checksum, "immutable": True},
        "available_tracks": [track],
    }
    (manifests_dir / "1.json").write_text(json.dumps(manifest), encoding="utf-8")
    repository = VitalDBRepository(settings, CaseRepository(settings), vitaldb_module=_VitalDb)
    return repository, _VitalFile("unused").track


def test_numeric_track_index_preserves_vector_samples_and_reuses_records(tmp_path):
    repository, _ = _repository(tmp_path)

    first = repository.read_numeric_observations("1", "Solar8000/ART_MBP", 0.75, 2.5)
    index = repository._numeric_series[("1", "Solar8000/ART_MBP")]
    track = repository._files[("1", "Solar8000/ART_MBP")].track
    second = repository.read_numeric_observations("1", "Solar8000/ART_MBP", 1.75, 2.5)

    assert [(row["timestamp"], row["value"]) for row in first["observations"]] == [
        (1.0, 30.0), (1.5, 40.0), (2.0, 50.0),
    ]
    assert [(row["timestamp"], row["value"]) for row in second["observations"]] == [
        (2.0, 50.0),
    ]
    assert index.sample_rate_hz == 2.0
    assert track.iterations == 1
