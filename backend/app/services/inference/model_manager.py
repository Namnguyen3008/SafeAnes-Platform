from __future__ import annotations

import logging
import math
import threading
from typing import Any

import numpy as np

from backend.app.core.config import Settings
from backend.app.core.errors import (
    ApiServiceError,
    inference_failed,
    input_not_eligible,
    invalid_time_range,
    insufficient_data,
    model_not_ready,
)
from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.contracts.prediction import ModelPrediction
from backend.app.ml.inference.base import (
    InferenceExecutionError,
    ModelNotLoadedError,
    ModelReadinessError,
)
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBDataError
from backend.app.ml.preprocessing.vitaldb_pipeline import (
    UC04FeatureBuilder,
    UC05FeatureBuilder,
    TrainingPreprocessorAdapter,
    validate_model_tensor_shapes,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.ml.validation.input_validation import InputValidationError
from backend.app.repositories.vitaldb_repository import VitalDBRepository
from backend.app.services.inference.lambda_client import LambdaInferenceClient

logger = logging.getLogger("safeanes.models")


class ModelManager:
    """Loads allowlisted checkpoints once and serializes access per model."""

    def __init__(
        self,
        settings: Settings,
        vitaldb: VitalDBRepository,
        *,
        load_models: bool = True,
        lambda_client: LambdaInferenceClient | None = None,
    ) -> None:
        self.settings = settings
        self.vitaldb = vitaldb
        self.lambda_client = lambda_client
        if (
            self.lambda_client is None
            and getattr(settings, "offload_inference", False)
            and getattr(settings, "inference_url", None)
        ):
            service_token = getattr(settings, "inference_service_token", None)
            if not service_token:
                raise ValueError("SAFEANES_INFERENCE_SERVICE_TOKEN is required for remote inference")
            self.lambda_client = LambdaInferenceClient(settings.inference_url, service_token)
        self.preprocessor = TrainingPreprocessorAdapter()
        self.contracts = {UC04_CONTRACT.model_id: UC04_CONTRACT, UC05_CONTRACT.model_id: UC05_CONTRACT}
        self.service_types = {UC04_CONTRACT.model_id: UC04InferenceService, UC05_CONTRACT.model_id: UC05InferenceService}
        self.services = {}
        self._construction_errors: dict[str, str] = {}
        for model_id, service_type in self.service_types.items():
            try:
                model_path = settings.uc04_model_path if model_id == UC04_CONTRACT.model_id else settings.uc05_model_path
                self.services[model_id] = service_type(
                    model_root=settings.model_root,
                    model_path=model_path,
                    model_registry_path=settings.model_registry_path,
                    device=settings.model_device,
                )
            except Exception as exc:
                self._construction_errors[model_id] = str(exc)
        self._locks = {model_id: threading.RLock() for model_id in self.services}
        self._load_errors: dict[str, str] = {}
        self._initialized = False
        self._load_models = load_models

    def initialize(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        if getattr(self.settings, "offload_inference", False) and getattr(self.settings, "inference_url", None):
            logger.info("Offloading ML inference to remote AWS Lambda: %s", self.settings.inference_url)
            for model_id, service in self.services.items():
                service.readiness_status = "INTEGRATION_READY"
            return
        if not self._load_models:
            return
        for model_id, service in self.services.items():
            try:
                with self._locks[model_id]:
                    service.load_model()
            except Exception as exc:
                self._load_errors[model_id] = str(exc)
                logger.error(
                    "model startup validation failed",
                    extra={"model_id": model_id, "error_type": type(exc).__name__},
                )

    def close(self) -> None:
        """Drop model references once no API requests are being served."""
        for model_id, service in self.services.items():
            with self._locks[model_id]:
                service.model = None

    def statuses(self) -> list[dict[str, Any]]:
        result = []
        is_offloaded = getattr(self.settings, "offload_inference", False) and getattr(self.settings, "inference_url", None)
        for model_id, contract in self.contracts.items():
            service = self.services.get(model_id)
            loaded = True if is_offloaded else (service is not None and service.model is not None)
            readiness = "INTEGRATION_READY" if is_offloaded else getattr(service, "readiness_status", "BLOCKED" if model_id in self._construction_errors else "NOT_LOADED")
            if not is_offloaded:
                if not loaded and (model_id in self._load_errors or model_id in self._construction_errors):
                    readiness = "BLOCKED"
                if model_id in self._construction_errors or model_id in self._load_errors:
                    blockers = ["MODEL_NOT_READY: configured artifact is missing or failed integrity validation"]
                elif not loaded and readiness != "INTEGRATION_READY":
                    blockers = ["MODEL_NOT_READY: model weights have not been loaded"]
                else:
                    blockers = list(getattr(service, "readiness_blockers", ())) if readiness != "INTEGRATION_READY" else []
            else:
                blockers = []
            result.append({
                "model_id": contract.model_id,
                "model_version": contract.model_version or "NOT_RECORDED",
                "task": contract.task,
                "framework": contract.framework,
                "artifact_hash": contract.artifact_sha256,
                "loaded": loaded,
                "readiness_status": readiness,
                "inference_ready": loaded and readiness == "INTEGRATION_READY",
                "calibration_status": _calibration_status(contract),
                "blockers": blockers,
            })
        return result

    def status(self, model_id: str) -> dict[str, Any]:
        canonical = self._canonical_model_id(model_id)
        return next(item for item in self.statuses() if item["model_id"] == canonical)

    def predict(
        self,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> list[dict[str, Any]]:
        service = self._service(model_id)
        case = self.vitaldb.cases.get_case(case_id)
        duration = float(case["duration_seconds"])
        if not isinstance(prediction_time_s, (int, float)) or not float("-inf") < float(prediction_time_s) < float("inf"):
            raise invalid_time_range("prediction_time_s must be finite case-relative seconds")
        if prediction_time_s < 0 or prediction_time_s > duration:
            raise invalid_time_range("prediction_time_s must be within the recorded case duration")

        model_status = self.status(service.contract.model_id)
        if not model_status["inference_ready"]:
            raise model_not_ready(
                f"{service.contract.model_id} is not ready for production inference",
                details={"readiness_status": model_status["readiness_status"], "blockers": model_status["blockers"]},
            )
        required_history = int(service.contract.window_seconds["numeric"])
        if prediction_time_s < required_history:
            raise insufficient_data(
                f"{service.contract.model_id} requires at least {required_history} seconds of recorded history",
                details={"required_history_seconds": required_history, "available_history_seconds": prediction_time_s},
            )
        try:
            series = self.vitaldb.get_model_series(case_id, service.contract.model_id)
            window: InferenceWindow = series.window_at(float(prediction_time_s))
        except VitalDBDataError as exc:
            raise insufficient_data(str(exc)) from exc
        except ValueError as exc:
            raise insufficient_data(str(exc)) from exc

        try:
            prepared = self.preprocessor.prepare(service.contract.model_id, window, case_signals=series)
        except ApiServiceError:
            raise
        except (InputValidationError, ValueError) as exc:
            raise input_not_eligible(str(exc)) from exc
        except Exception as exc:
            raise inference_failed("Training-compatible preprocessing failed") from exc
        report = prepared.report
        if not report["input_eligible"]:
            raise input_not_eligible(
                "The recorded window does not meet the verified model input contract",
                details={"quality": report["quality"], "abstain_reasons": report["abstain_reasons"]},
            )
        if not report["inference_eligible"]:
            raise model_not_ready(
                "Model input preprocessing is available, but model readiness blocks inference",
                details={"blockers": report["model_readiness_blockers"]},
            )

        prepared_input = prepared.prepared
        if prepared_input is None or not prepared.model_tensors:
            raise input_not_eligible("Training-compatible preprocessing did not produce model tensors")

        if (
            getattr(self.settings, "offload_inference", False)
            and getattr(self.settings, "inference_url", None)
        ):
            if self.lambda_client is None:
                raise model_not_ready("Remote inference client is not configured")
            try:
                payload = _remote_inference_payload(
                    contract=service.contract,
                    case_id=case_id,
                    window=window,
                    prepared=prepared,
                )
            except (InputValidationError, TypeError, ValueError) as exc:
                raise input_not_eligible("Prepared tensors do not satisfy the remote inference contract") from exc

            try:
                response = self.lambda_client.predict(payload)
            except ApiServiceError as exc:
                if exc.code == "INVALID_INFERENCE_REQUEST":
                    raise input_not_eligible("Prepared remote inference request was rejected") from exc
                if exc.code == "MODEL_NOT_READY":
                    raise model_not_ready("Remote inference model is not ready") from exc
                raise inference_failed("Remote inference request failed") from exc
            except Exception as exc:
                raise inference_failed("Remote inference request failed") from exc

            try:
                remote_predictions = _remote_predictions(
                    response,
                    contract=service.contract,
                    case_id=case_id,
                    prediction_time_s=float(prediction_time_s),
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise inference_failed("Remote inference response did not match the prediction contract") from exc
            return [
                _prediction_response(item, service.contract.artifact_sha256)
                for item in remote_predictions
            ]

        try:
            with self._locks[service.contract.model_id]:
                if service.contract.model_id == UC04_CONTRACT.model_id:
                    predictions = service.predict_window(window, prepared_input=prepared_input)
                else:
                    predictions = service.predict_window(
                        window,
                        prepared_input=prepared_input,
                    )
        except ModelReadinessError as exc:
            raise model_not_ready(str(exc)) from exc
        except (InputValidationError, ValueError) as exc:
            raise input_not_eligible(str(exc)) from exc
        except (InferenceExecutionError, ModelNotLoadedError) as exc:
            raise inference_failed(str(exc)) from exc
        except Exception as exc:
            raise inference_failed(f"{service.contract.model_id} inference failed") from exc
        return [_prediction_response(item, service.contract.artifact_sha256) for item in predictions]

    def _service(self, model_id: str):
        canonical = self._canonical_model_id(model_id)
        service = self.services.get(canonical)
        if service is None:
            raise model_not_ready(
                "The model runtime could not be initialized",
                details={"readiness_status": "BLOCKED"},
            )
        return service

    def _canonical_model_id(self, model_id: str) -> str:
        normalized = model_id.casefold()
        aliases = {"uc04": UC04_CONTRACT.model_id, "uc05": UC05_CONTRACT.model_id}
        canonical = aliases.get(normalized, model_id)
        if canonical not in self.contracts:
            raise ApiServiceError("MODEL_NOT_FOUND", "Model ID is not allowlisted", status_code=404)
        return canonical


def _remote_inference_payload(
    *,
    contract: Any,
    case_id: str,
    window: InferenceWindow,
    prepared: Any,
) -> dict[str, Any]:
    prepared_input = prepared.prepared
    if prepared_input is None:
        raise InputValidationError("prepared model input is missing")

    tensors = prepared.model_tensors
    expected_names = (
        UC05FeatureBuilder.input_order
        if contract.model_id == UC05_CONTRACT.model_id
        else UC04FeatureBuilder.input_order
    )
    if set(tensors) != set(expected_names):
        raise InputValidationError("prepared tensors do not match the model input names")
    validate_model_tensor_shapes(contract.model_id, tensors)

    tensors_json: dict[str, Any] = {}
    for name in expected_names:
        try:
            array = np.asarray(tensors[name], dtype=np.float32)
        except (TypeError, ValueError, OverflowError) as exc:
            raise InputValidationError(f"prepared {name} tensor is not numeric") from exc
        if np.isinf(array).any() or (name not in {"numeric", "static"} and np.isnan(array).any()):
            raise InputValidationError(f"prepared {name} tensor contains invalid non-finite values")
        json_array = np.empty(array.shape, dtype=object)
        for index, value in np.ndenumerate(array):
            json_array[index] = None if np.isnan(value) else float(value)
        tensors_json[name] = json_array.tolist()

    masks = ("numeric_mask", "wave_mask") if contract.model_id == UC05_CONTRACT.model_id else (
        "numeric_mask", "modality_mask"
    )
    for name in masks:
        if not np.isin(np.asarray(tensors[name]), (0.0, 1.0)).all():
            raise InputValidationError(f"prepared {name} tensor must contain only 0 or 1")
    if np.any(np.isnan(np.asarray(tensors["numeric"], dtype=np.float32)) & (
        np.asarray(tensors["numeric_mask"], dtype=np.float32) >= 0.5
    )):
        raise InputValidationError("numeric_mask must mark NaN numeric values as missing")

    quality_status = prepared_input.quality_status
    if quality_status not in {"GOOD", "DEGRADED"}:
        raise InputValidationError("prepared quality status is invalid")
    data_coverage = float(prepared_input.data_coverage)
    if not math.isfinite(data_coverage) or not 0.0 <= data_coverage <= 1.0:
        raise InputValidationError("prepared data coverage must be between 0 and 1")
    missing_features = list(prepared_input.missing_features)
    if any(not isinstance(feature, str) for feature in missing_features):
        raise InputValidationError("prepared missing features must be strings")

    return {
        "contract_version": "safeanes.inference.v1",
        "model_id": contract.model_id,
        "case_id": case_id,
        "prediction_time_s": float(window.prediction_time_s),
        "window": {
            "window_start_s": float(window.window_start_s),
            "window_end_s": float(window.window_end_s),
            "selected_tracks": dict(window.selected_tracks),
        },
        "tensors": tensors_json,
        "quality_status": quality_status,
        "data_coverage": data_coverage,
        "missing_features": missing_features,
    }


def _remote_predictions(
    response: Any,
    *,
    contract: Any,
    case_id: str,
    prediction_time_s: float,
) -> list[ModelPrediction]:
    if not isinstance(response, dict):
        raise TypeError("remote response must be an object")
    rows = response.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError("remote response must contain predictions")

    predictions: list[ModelPrediction] = []
    expected_start = prediction_time_s - float(contract.window_seconds["numeric"])
    for row in rows:
        if not isinstance(row, dict):
            raise TypeError("remote prediction must be an object")
        prediction = ModelPrediction(**row)
        if (
            prediction.model_id != contract.model_id
            or prediction.model_version != contract.model_version
            or prediction.case_id != case_id
            or not math.isclose(float(prediction.prediction_time), prediction_time_s, abs_tol=1e-6)
            or not math.isclose(float(prediction.window_start), expected_start, abs_tol=1e-6)
            or not math.isclose(float(prediction.window_end), prediction_time_s, abs_tol=1e-6)
            or prediction.horizon_if_supported not in contract.prediction_horizons
            or prediction.quality_status not in {"GOOD", "DEGRADED"}
            or not isinstance(prediction.interpreted_output, dict)
            or not math.isfinite(float(prediction.raw_output))
            or not math.isfinite(float(prediction.data_coverage))
            or not 0.0 <= float(prediction.data_coverage) <= 1.0
        ):
            raise ValueError("remote prediction did not match the model contract")
        predictions.append(prediction)
    return predictions


def _calibration_status(contract) -> str:
    if not contract.calibration_method:
        return "NOT_AVAILABLE"
    if contract.model_id == UC04_CONTRACT.model_id:
        return "NOT_CALIBRATED"
    return "SAVED_CALIBRATION_AVAILABLE"


def _prediction_response(prediction, artifact_hash: str) -> dict[str, Any]:
    interpreted = prediction.interpreted_output
    return {
        "case_id": prediction.case_id,
        "model_id": prediction.model_id,
        "model_version": prediction.model_version or "NOT_RECORDED",
        "prediction_time": prediction.prediction_time,
        "task": prediction.task,
        "horizon_if_applicable": prediction.horizon_if_supported,
        "output": {"raw": prediction.raw_output, "interpreted": interpreted},
        "output_semantics": interpreted.get("kind", "model-defined output"),
        "calibration_status": "CALIBRATED" if interpreted.get("calibrated") is True else "NOT_CALIBRATED",
        "data_coverage": prediction.data_coverage,
        "quality": prediction.quality_status,
        "missing_features": list(prediction.missing_features),
        "input_window": {"start_time_s": prediction.window_start, "end_time_s": prediction.window_end},
        "artifact_hash": artifact_hash,
        "preprocessing_version": prediction.preprocessing_version,
        "source_tracks": prediction.source_tracks or {},
        "input_window_start": prediction.window_start,
        "input_window_end": prediction.window_end,
        "raw_output": prediction.raw_output,
        "interpreted_output": interpreted,
        "horizon_minutes_or_null": prediction.horizon_if_supported,
        "calibrated_or_not": interpreted.get("calibrated") is True,
        "threshold_if_verified": interpreted.get("threshold"),
        "artifact_sha256": artifact_hash,
    }
