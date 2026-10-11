from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class ModelPrediction:
    model_id: str
    model_version: str | None
    case_id: str
    window_start: float
    window_end: float
    prediction_time: float
    task: str
    raw_output: float
    interpreted_output: dict[str, Any]
    horizon_if_supported: int | None
    quality_status: str
    data_coverage: float
    missing_features: tuple[str, ...]
    preprocessing_version: str
    confidence: float | None = None
    source_tracks: dict[str, str | None] | None = None

    def as_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["missing_features"] = list(self.missing_features)
        return value
