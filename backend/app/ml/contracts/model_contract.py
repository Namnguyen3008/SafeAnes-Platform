from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelContract:
    model_id: str
    model_version: str | None
    task: str
    artifact_path: str
    artifact_sha256: str
    framework: str
    framework_version: str | None
    required_tracks: tuple[str, ...]
    required_features: tuple[str, ...]
    feature_order: dict[str, tuple[str, ...]]
    input_shape: dict[str, tuple[int | None, ...]]
    sample_rate_hz: dict[str, float]
    window_seconds: dict[str, int]
    stride_seconds: int
    prediction_horizons: tuple[int, ...]
    output_semantics: dict[str, Any]
    normalization: dict[str, Any]
    missing_data_policy: dict[str, Any]
    calibration_method: str | None
    decision_threshold: dict[str, float] | None
    supported_runtime: tuple[str, ...]
    supporting_artifacts: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "model_version": self.model_version,
            "task": self.task,
            "artifact_path": self.artifact_path,
            "artifact_sha256": self.artifact_sha256,
            "framework": self.framework,
            "framework_version": self.framework_version,
            "required_tracks": list(self.required_tracks),
            "required_features": list(self.required_features),
            "feature_order": {
                key: list(value) for key, value in self.feature_order.items()
            },
            "input_shape": self.input_shape,
            "sample_rate_hz": self.sample_rate_hz,
            "window_seconds": self.window_seconds,
            "stride_seconds": self.stride_seconds,
            "prediction_horizons": list(self.prediction_horizons),
            "output_semantics": self.output_semantics,
            "normalization": self.normalization,
            "missing_data_policy": self.missing_data_policy,
            "calibration_method": self.calibration_method,
            "decision_threshold": self.decision_threshold,
            "supported_runtime": list(self.supported_runtime),
            "supporting_artifacts": self.supporting_artifacts,
        }
