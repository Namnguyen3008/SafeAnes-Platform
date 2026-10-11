from __future__ import annotations

from typing import Any


class ApiServiceError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def case_not_found(case_id: str) -> ApiServiceError:
    return ApiServiceError("CASE_NOT_FOUND", f"VitalDB case {case_id} is not in the local catalog", status_code=404)


def track_not_available(track_name: str) -> ApiServiceError:
    return ApiServiceError("TRACK_NOT_AVAILABLE", f"Track {track_name} is not available for this case", status_code=404)


def cache_not_ready(message: str = "The selected VitalDB case is not ready in the local cache") -> ApiServiceError:
    return ApiServiceError("CACHE_NOT_READY", message, status_code=503)


def invalid_time_range(message: str) -> ApiServiceError:
    return ApiServiceError("INVALID_TIME_RANGE", message, status_code=422)


def insufficient_data(message: str, *, details: dict[str, Any] | None = None) -> ApiServiceError:
    return ApiServiceError("INSUFFICIENT_DATA", message, status_code=422, details=details)


def model_not_ready(message: str, *, details: dict[str, Any] | None = None) -> ApiServiceError:
    return ApiServiceError("MODEL_NOT_READY", message, status_code=503, details=details)


def input_not_eligible(message: str, *, details: dict[str, Any] | None = None) -> ApiServiceError:
    return ApiServiceError("INPUT_NOT_ELIGIBLE", message, status_code=422, details=details)


def inference_failed(message: str = "Model inference failed") -> ApiServiceError:
    return ApiServiceError("INFERENCE_FAILED", message, status_code=500)
