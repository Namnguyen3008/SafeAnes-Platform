from __future__ import annotations

import math
from typing import Any

import numpy as np
import torch

from backend.app.ml.contracts.prediction import ModelPrediction
from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.models.uc05.architecture import (
    NUM_CENTER,
    NUM_SCALE,
    STATIC_CENTER,
    STATIC_SCALE,
    RespFormer,
    UC05ArchitectureConfig,
)
from backend.app.ml.preprocessing.uc05 import (
    UC05_PREPROCESSING_VERSION,
    PreparedUC05Input,
    QualityGateError,
    preprocess_uc05_window,
)
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.ml.validation.input_validation import (
    InputValidationError,
    validate_feature_order,
    validate_future_information,
)
from .base import (
    BaseInferenceService,
    InferenceExecutionError,
    ModelLoadError,
    ModelReadinessError,
)


class UC05InferenceService(BaseInferenceService):
    """Runs RespFormer and only applies the bundled saved temperature scaling."""

    contract = UC05_CONTRACT
    readiness_blockers = (
        "signal_schema.json marks capno, AWP, and PPG required while the released "
        "stream evaluator gate requires PPG plus capno or AWP; resolve this "
        "training-contract discrepancy before production deployment",
    )

    def __init__(
        self,
        *,
        model_root=None,
        model_path=None,
        model_registry_path=None,
        device: str | torch.device = "cpu",
        allow_blocked_inference: bool = False,
    ) -> None:
        super().__init__(
            model_root=model_root,
            model_path=model_path,
            model_registry_path=model_registry_path,
            device=device,
        )
        self.allow_blocked_inference = allow_blocked_inference
        self.config: dict[str, Any] | None = None
        self.schema: dict[str, Any] | None = None
        self.calibration: dict[str, Any] | None = None
        self.readiness_status = "NOT_LOADED"

    def load_model(self) -> None:
        try:
            config = self.registry.load_supporting_json(self.contract, "config.json")
            schema = self.registry.load_supporting_json(
                self.contract, "signal_schema.json"
            )
            calibration = self.registry.load_supporting_json(
                self.contract, "calibration_thresholds_metrics.json"
            )
            expected = {
                "NUM_HISTORY_SEC": 600,
                "WAVE_HISTORY_SEC": 60,
                "HORIZONS_MIN": [1, 3, 5],
                "PRED_STRIDE_SEC": 30,
                "CAPNO_HZ": 62.5,
                "AWP_HZ": 62.5,
                "PPG_HZ": 125.0,
                "FLOW_HZ": 62.5,
                "RESP_HZ": 62.5,
            }
            for key, value in expected.items():
                if config.get(key) != value:
                    raise ModelLoadError(
                        f"UC05 config contract mismatch for {key}: {config.get(key)!r}"
                    )
            if tuple(schema.get("numeric_features", ())) != self.contract.feature_order[
                "numeric"
            ]:
                raise ModelLoadError("UC05 signal schema numeric feature order mismatch")
            if schema.get("numeric_history_sec") != 600:
                raise ModelLoadError("UC05 schema window differs from audited contract")
            expected_waveforms = {
                "capno": (62.5, 60, False),
                "awp": (62.5, 60, False),
                "ppg": (125.0, 60, False),
                "flow": (62.5, 60, True),
                "resp": (62.5, 60, True),
            }
            schema_waves = schema.get("waveforms", {})
            for name, (rate, seconds, optional) in expected_waveforms.items():
                entry = schema_waves.get(name, {})
                if (
                    float(entry.get("hz", math.nan)) != rate
                    or entry.get("seconds") != seconds
                    or entry.get("optional") is not optional
                ):
                    raise ModelLoadError(
                        f"UC05 signal schema mismatch for waveform {name}"
                    )
            cfg = UC05ArchitectureConfig(
                **{
                    name: config[name]
                    for name in UC05ArchitectureConfig.__dataclass_fields__
                    if name in config
                }
            )
            model = RespFormer(cfg)
            state = self.registry.load_state_dict(self.contract, self.device)
            incompatible = model.load_state_dict(state, strict=True)
            if incompatible.missing_keys or incompatible.unexpected_keys:
                raise ModelLoadError("UC05 checkpoint keys do not match architecture")
            for name, expected_values in (
                ("num_center", NUM_CENTER),
                ("num_scale", NUM_SCALE),
                ("static_center", STATIC_CENTER),
                ("static_scale", STATIC_SCALE),
            ):
                actual = getattr(model.backbone, name).detach().cpu().numpy()
                if not np.array_equal(actual, np.asarray(expected_values, np.float32)):
                    raise ModelLoadError(
                        f"UC05 checkpoint normalization buffer mismatch: {name}"
                    )
            if calibration.get("status") != "CALIBRATION_SUCCESS":
                raise ModelLoadError("UC05 calibration artifact is not successful")
            temperatures = calibration.get("temperature", {})
            if set(temperatures) != {"1", "3", "5"} or any(
                not math.isfinite(float(value)) or float(value) <= 0
                for value in temperatures.values()
            ):
                raise ModelLoadError("UC05 saved temperature parameters are invalid")
            threshold = float(calibration.get("threshold_5m", math.nan))
            if not math.isfinite(threshold) or not 0 <= threshold <= 1:
                raise ModelLoadError("UC05 saved 5-minute threshold is invalid")
            model.to(self.device).eval()
            self.model = model
            self.config = config
            self.schema = schema
            self.calibration = calibration
            self.readiness_status = "BLOCKED_CONTRACT_MISMATCH"
        except Exception as exc:
            self.model = None
            self.readiness_status = "BLOCKED"
            if isinstance(exc, ModelLoadError):
                raise
            raise ModelLoadError(f"failed to load audited UC05 model: {exc}") from exc

    def validate_inputs(self, window: InferenceWindow) -> None:
        validate_future_information(window)
        if abs(window.window_start_s - (window.prediction_time_s - 600)) > 1e-6:
            raise InputValidationError("UC05 prediction window must span 600 seconds")
        if abs(window.window_end_s - window.prediction_time_s) > 1e-6:
            raise InputValidationError("UC05 window_end_s must equal prediction_time_s")
        validate_feature_order(
            window.numeric_feature_order,
            self.contract.feature_order["numeric"],
            "UC05 numeric",
        )
        expected_spo2 = "Solar8000/PLETH_SPO2"
        if window.selected_tracks.get("SPO2") != expected_spo2:
            raise InputValidationError(
                f"UC05 SPO2 must come from the audited track {expected_spo2}"
            )
        if window.selected_tracks.get("ppg") != "SNUADC/PLETH":
            raise InputValidationError("UC05 PPG must come from SNUADC/PLETH")
        if (
            window.selected_tracks.get("capno") is None
            and window.selected_tracks.get("awp") is None
        ):
            raise InputValidationError("UC05 requires capno or AWP per stream evaluator")
        wave_track_roles = {
            name: name for name in ("capno", "awp", "ppg", "flow", "resp")
        }
        for name, role in wave_track_roles.items():
            signal = window.waveforms.get(name)
            selected = window.selected_tracks.get(role)
            if signal is not None and (
                selected is None or signal.source_track != selected
            ):
                raise InputValidationError(
                    f"UC05 {name} waveform provenance does not match selected track"
                )

    def preprocess_window(self, window: InferenceWindow) -> PreparedUC05Input:
        self.validate_inputs(window)
        return preprocess_uc05_window(window)

    @torch.inference_mode()
    def predict_window(
        self,
        window: InferenceWindow,
        *,
        prepared_input: PreparedUC05Input | None = None,
        strict_schema: bool = False,
    ) -> list[ModelPrediction]:
        model = self._require_model()
        if strict_schema:
            if self.readiness_status not in {"INTEGRATION_READY", "BLOCKED_CONTRACT_MISMATCH"}:
                raise ModelReadinessError("UC05 model is not loaded and ready for strict-schema inference")
        elif self.readiness_status != "INTEGRATION_READY" and not self.allow_blocked_inference:
            raise ModelReadinessError(
                "UC05 inference is blocked by the unresolved required-waveform contract; "
                "diagnostic-only execution requires allow_blocked_inference=True"
            )
        prepared = prepared_input if prepared_input is not None else self.preprocess_window(window)
        if strict_schema:
            if self.schema is None:
                raise ModelReadinessError("UC05 exported signal_schema.json has not been loaded")
            required = [
                name for name, config in self.schema.get("waveforms", {}).items()
                if config.get("optional") is False
            ]
            # wave_mask follows the exported schema order, rather than being inferred
            # from truthy waveform samples.  A zero mask is an explicit abstention.
            from backend.app.ml.preprocessing.uc05 import UC05_WAVE_ORDER
            missing = [
                name for name in required
                if name not in UC05_WAVE_ORDER
                or prepared.wave_mask.shape != (1, len(UC05_WAVE_ORDER))
                or float(prepared.wave_mask[0, UC05_WAVE_ORDER.index(name)]) < 0.5
            ]
            if missing:
                raise QualityGateError(
                    "UC05 signal_schema.json requires valid capno, AWP, and PPG; "
                    "unavailable or invalid: " + ", ".join(missing)
                )
        args = [
            torch.as_tensor(prepared.waves[name], dtype=torch.float32, device=self.device)
            for name in ("capno", "awp", "ppg", "flow", "resp")
        ]
        args.extend(
            torch.as_tensor(value, dtype=torch.float32, device=self.device)
            for value in (
                prepared.numeric,
                prepared.numeric_mask,
                prepared.static,
                prepared.wave_mask,
            )
        )
        try:
            logits, auxiliary_logit = model(*args)
            if (
                logits.shape != (1, 3)
                or auxiliary_logit.shape != (1,)
                or not torch.isfinite(logits).all()
                or not torch.isfinite(auxiliary_logit).all()
            ):
                raise InferenceExecutionError(
                    "UC05 expected finite [1,3] hypoxemia and [1] auxiliary logits"
                )
            raw = logits[0].detach().cpu().tolist()
            auxiliary = float(auxiliary_logit[0].detach().cpu())
        except InferenceExecutionError:
            raise
        except Exception as exc:
            raise InferenceExecutionError(f"UC05 forward pass failed: {exc}") from exc
        return self.postprocess_output(
            window, prepared, raw, auxiliary,
            input_contract_mode="STRICT_SIGNAL_SCHEMA" if strict_schema else "STREAM_EVALUATOR_DIAGNOSTIC",
        )

    def postprocess_output(
        self,
        window: InferenceWindow,
        prepared: PreparedUC05Input,
        raw_logits: list[float],
        auxiliary_logit: float,
        *,
        input_contract_mode: str = "STREAM_EVALUATOR_DIAGNOSTIC",
    ) -> list[ModelPrediction]:
        if self.calibration is None:
            raise ModelLoadError("UC05 saved calibration artifact has not been loaded")
        predictions: list[ModelPrediction] = []
        temperatures = self.calibration["temperature"]
        threshold = float(self.calibration["threshold_5m"])
        for horizon, logit in zip(self.contract.prediction_horizons, raw_logits):
            temperature = float(temperatures[str(horizon)])
            scaled = max(-80.0, min(80.0, float(logit) / temperature))
            score = 1.0 / (1.0 + math.exp(-scaled))
            is_threshold_horizon = horizon == 5
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
                    interpreted_output={
                        "kind": "temperature_scaled_probability",
                        "value": score,
                        "calibrated": True,
                        "calibration_method": "temperature_scaling",
                        "temperature": temperature,
                        "threshold": threshold if is_threshold_horizon else None,
                        "threshold_decision": score >= threshold if is_threshold_horizon else None,
                        "input_contract_mode": input_contract_mode,
                    },
                    horizon_if_supported=horizon,
                    quality_status=prepared.quality_status,
                    data_coverage=prepared.data_coverage,
                    missing_features=prepared.missing_features,
                    preprocessing_version=UC05_PREPROCESSING_VERSION,
                    confidence=None,
                    source_tracks=dict(window.selected_tracks),
                )
            )
        predictions.append(
            ModelPrediction(
                model_id=self.contract.model_id,
                model_version=self.contract.model_version,
                case_id=window.case_id,
                window_start=window.window_start_s,
                window_end=window.window_end_s,
                prediction_time=window.prediction_time_s,
                task="Auxiliary signal-derived ventilation-loss pattern; not a diagnosis or cause",
                raw_output=float(auxiliary_logit),
                interpreted_output={
                    "kind": "raw_logit",
                    "value": float(auxiliary_logit),
                    "calibrated": False,
                    "interpretation": "weak signal-derived pattern output; not a diagnosis",
                    "input_contract_mode": input_contract_mode,
                },
                horizon_if_supported=None,
                quality_status=prepared.quality_status,
                data_coverage=prepared.data_coverage,
                missing_features=prepared.missing_features,
                preprocessing_version=UC05_PREPROCESSING_VERSION,
                confidence=None,
                source_tracks=dict(window.selected_tracks),
            )
        )
        return predictions
