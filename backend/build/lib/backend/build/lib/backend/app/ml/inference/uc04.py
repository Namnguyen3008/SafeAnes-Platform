from __future__ import annotations

import math
from typing import Any

import numpy as np
import torch

from backend.app.ml.contracts.prediction import ModelPrediction
from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.models.uc04.architecture import (
    HypoFormer,
    NUM_CENTER,
    NUM_SCALE,
    STATIC_CENTER,
    STATIC_SCALE,
    UC04ArchitectureConfig,
)
from backend.app.ml.preprocessing.uc04 import (
    UC04_PREPROCESSING_VERSION,
    PreparedUC04Input,
    preprocess_uc04_window,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT
from backend.app.ml.validation.input_validation import (
    InputValidationError,
    validate_feature_order,
    validate_future_information,
)
from .base import BaseInferenceService, InferenceExecutionError, ModelLoadError


class UC04InferenceService(BaseInferenceService):
    """Runs the verified HypoFormer checkpoint without fitting any artifacts."""

    contract = UC04_CONTRACT

    def __init__(
        self,
        *,
        model_root=None,
        model_path=None,
        model_registry_path=None,
        device: str | torch.device = "cpu",
    ) -> None:
        super().__init__(
            model_root=model_root,
            model_path=model_path,
            model_registry_path=model_registry_path,
            device=device,
        )
        self.config: dict[str, Any] | None = None
        self.thresholds: dict[str, Any] | None = None
        self.readiness_status = "NOT_LOADED"

    def load_model(self) -> None:
        try:
            config = self.registry.load_supporting_json(self.contract, "config.json")
            thresholds = self.registry.load_supporting_json(
                self.contract, "thresholds.json"
            )
            expected = {
                "NUM_HISTORY_SEC": 300,
                "WAVE_HISTORY_SEC": 30,
                "HORIZONS_MIN": [5, 10, 15],
                "STRIDE_SEC": 30,
                "ART_HZ": 100,
                "ECG_HZ": 250,
                "PPG_HZ": 100,
                "CAPNO_HZ": 62.5,
            }
            for key, value in expected.items():
                if config.get(key) != value:
                    raise ModelLoadError(
                        f"UC04 config contract mismatch for {key}: {config.get(key)!r}"
                    )
            cfg = UC04ArchitectureConfig(
                **{
                    name: config[name]
                    for name in UC04ArchitectureConfig.__dataclass_fields__
                    if name in config
                }
            )
            model = HypoFormer(cfg)
            state = self.registry.load_state_dict(self.contract, self.device)
            incompatible = model.load_state_dict(state, strict=True)
            if incompatible.missing_keys or incompatible.unexpected_keys:
                raise ModelLoadError("UC04 checkpoint keys do not match architecture")
            for name, expected_values in (
                ("num_center", NUM_CENTER),
                ("num_scale", NUM_SCALE),
                ("static_center", STATIC_CENTER),
                ("static_scale", STATIC_SCALE),
            ):
                actual = getattr(model, name).detach().cpu().numpy()
                if not np.array_equal(actual, np.asarray(expected_values, np.float32)):
                    raise ModelLoadError(
                        f"UC04 checkpoint normalization buffer mismatch: {name}"
                    )
            if not math.isclose(float(thresholds.get("5m", math.nan)), 0.5):
                raise ModelLoadError("UC04 saved 5-minute threshold differs from audit")
            model.to(self.device).eval()
            self.model = model
            self.config = config
            self.thresholds = thresholds
            self.readiness_status = "INTEGRATION_READY"
        except Exception as exc:
            self.model = None
            self.readiness_status = "BLOCKED"
            if isinstance(exc, ModelLoadError):
                raise
            raise ModelLoadError(f"failed to load audited UC04 model: {exc}") from exc

    def validate_inputs(self, window: InferenceWindow) -> None:
        validate_future_information(window)
        if abs(window.window_start_s - (window.prediction_time_s - 300)) > 1e-6:
            raise InputValidationError("UC04 prediction window must span 300 seconds")
        if abs(window.window_end_s - window.prediction_time_s) > 1e-6:
            raise InputValidationError("UC04 window_end_s must equal prediction_time_s")
        validate_feature_order(
            window.numeric_feature_order,
            self.contract.feature_order["numeric"],
            "UC04 numeric",
        )
        required_tracks = {
            "ART_WAVE": "SNUADC/ART",
            "MAP": "Solar8000/ART_MBP",
            "HR": "Solar8000/HR",
        }
        for role, expected in required_tracks.items():
            if window.selected_tracks.get(role) != expected:
                raise InputValidationError(
                    f"UC04 {role} must come from the audited track {expected}"
                )
        wave_track_roles = {
            "art": "ART_WAVE",
            "ecg": "ECG_WAVE",
            "ppg": "PPG_WAVE",
            "capno": "CAPNO_WAVE",
        }
        for name, role in wave_track_roles.items():
            signal = window.waveforms.get(name)
            selected = window.selected_tracks.get(role)
            if signal is not None and (
                selected is None or signal.source_track != selected
            ):
                raise InputValidationError(
                    f"UC04 {name} waveform provenance does not match selected track"
                )

    def preprocess_window(self, window: InferenceWindow) -> PreparedUC04Input:
        self.validate_inputs(window)
        return preprocess_uc04_window(window)

    @torch.inference_mode()
    def predict_window(
        self,
        window: InferenceWindow,
        *,
        prepared_input: PreparedUC04Input | None = None,
    ) -> list[ModelPrediction]:
        model = self._require_model()
        if prepared_input is None:
            prepared = self.preprocess_window(window)
        else:
            # The request manager supplies the exact result used to pass its
            # training-time feature, unit, and quality gates.
            self.validate_inputs(window)
            prepared = prepared_input
        tensors = {
            "art": prepared.art,
            "ecg": prepared.ecg,
            "ppg": prepared.ppg,
            "capno": prepared.capno,
            "numeric": prepared.numeric,
            "numeric_mask": prepared.numeric_mask,
            "static": prepared.static,
            "modality_mask": prepared.modality_mask,
        }
        try:
            args = [
                torch.as_tensor(tensors[name], dtype=torch.float32, device=self.device)
                for name in (
                    "art", "ecg", "ppg", "capno", "numeric", "numeric_mask",
                    "static", "modality_mask",
                )
            ]
            logits = model(*args)
            if logits.shape != (1, 3) or not torch.isfinite(logits).all():
                raise InferenceExecutionError(
                    f"UC04 expected finite logits [1, 3], received {tuple(logits.shape)}"
                )
            raw = logits[0].detach().cpu().tolist()
        except InferenceExecutionError:
            raise
        except Exception as exc:
            raise InferenceExecutionError(f"UC04 forward pass failed: {exc}") from exc
        return self.postprocess_output(window, prepared, raw)

    def postprocess_output(
        self,
        window: InferenceWindow,
        prepared: PreparedUC04Input,
        raw_logits: list[float],
    ) -> list[ModelPrediction]:
        predictions: list[ModelPrediction] = []
        threshold = float(self.thresholds["5m"]) if self.thresholds else 0.5
        for horizon, logit in zip(self.contract.prediction_horizons, raw_logits):
            score = 1.0 / (1.0 + math.exp(-max(-80.0, min(80.0, float(logit)))))
            threshold_for_horizon = threshold if horizon == 5 else None
            interpreted = {
                "kind": "uncalibrated_sigmoid_score",
                "value": score,
                "calibrated": False,
                "threshold": threshold_for_horizon,
                "threshold_decision": (
                    score >= threshold if threshold_for_horizon is not None else None
                ),
            }
            predictions.append(
                ModelPrediction(
                    model_id=self.contract.model_id,
                    model_version=self.contract.model_version,
                    case_id=window.case_id,
                    window_start=window.window_start_s,
                    window_end=window.window_end_s,
                    prediction_time=window.prediction_time_s,
                    task=self.contract.task,
                    raw_output=float(logit),
                    interpreted_output=interpreted,
                    horizon_if_supported=horizon,
                    quality_status=prepared.quality_status,
                    data_coverage=prepared.data_coverage,
                    missing_features=prepared.missing_features,
                    preprocessing_version=UC04_PREPROCESSING_VERSION,
                    confidence=None,
                    source_tracks=dict(window.selected_tracks),
                )
            )
        return predictions
