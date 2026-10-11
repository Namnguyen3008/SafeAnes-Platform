from __future__ import annotations

import threading
import logging
from typing import Any

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
from backend.app.ml.inference.base import (
    InferenceExecutionError,
    ModelNotLoadedError,
    ModelReadinessError,
)
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBDataError
from backend.app.ml.preprocessing.vitaldb_pipeline import TrainingPreprocessorAdapter
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.ml.validation.input_validation import InputValidationError
from backend.app.repositories.vitaldb_repository import VitalDBRepository

logger = logging.getLogger("safeanes.models")


class ModelManager:
    """Loads allowlisted checkpoints once and serializes access per model."""

    def __init__(self, settings: Settings, vitaldb: VitalDBRepository, *, load_models: bool = True) -> None:
        self.settings = settings
        self.vitaldb = vitaldb
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
        for model_id, contract in self.contracts.items():
            service = self.services.get(model_id)
            loaded = service is not None and service.model is not None
            readiness = getattr(service, "readiness_status", "BLOCKED" if model_id in self._construction_errors else "NOT_LOADED")
            if not loaded and (model_id in self._load_errors or model_id in self._construction_errors):
                readiness = "BLOCKED"
            if model_id in self._construction_errors or model_id in self._load_errors:
                blockers = ["MODEL_NOT_READY: configured artifact is missing or failed integrity validation"]
            elif not loaded and readiness != "INTEGRATION_READY":
                blockers = ["MODEL_NOT_READY: model weights have not been loaded"]
            else:
                blockers = list(getattr(service, "readiness_blockers", ())) if readiness != "INTEGRATION_READY" else []
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
        if service.contract.model_id == UC04_CONTRACT.model_id and prepared_input is None:
            raise input_not_eligible("UC04 preprocessing did not produce model tensors")

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
