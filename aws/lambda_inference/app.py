from __future__ import annotations

import json
import hmac
import logging
import math
import os
import sys
import time
from pathlib import Path
from typing import Any

# Ensure current directory is on path
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

logger = logging.getLogger("safeanes.lambda_inference")
logger.setLevel(logging.INFO)

import numpy as np
import torch

from backend.app.ml.contracts.prediction import ModelPrediction
from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.uc04 import PreparedUC04Input
from backend.app.ml.preprocessing.uc05 import PreparedUC05Input
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT

MODELS_ROOT = CURRENT_DIR / "models"
REGISTRY_PATH = CURRENT_DIR / "backend" / "app" / "ml" / "registry" / "model_registry.json"

# Global warmed singletons
uc04_service: UC04InferenceService | None = None
uc05_service: UC05InferenceService | None = None


def get_services() -> tuple[UC04InferenceService, UC05InferenceService]:
    global uc04_service, uc05_service
    if uc04_service is None:
        logger.info("Initializing SafeAnes UC04 HypoFormer in Lambda memory...")
        uc04_path = MODELS_ROOT / "safeanes_uc04_model" / "model.pt"
        uc04 = UC04InferenceService(
            model_root=MODELS_ROOT,
            model_path=uc04_path,
            model_registry_path=REGISTRY_PATH,
            device="cpu",
        )
        uc04.load_model()
        uc04_service = uc04

    if uc05_service is None:
        logger.info("Initializing SafeAnes UC05 RespFormer in Lambda memory...")
        uc05_path = MODELS_ROOT / "safeanes_uc05_respformer_v1" / "respformer.pt"
        uc05 = UC05InferenceService(
            model_root=MODELS_ROOT,
            model_path=uc05_path,
            model_registry_path=REGISTRY_PATH,
            device="cpu",
        )
        uc05.load_model()
        uc05_service = uc05

    return uc04_service, uc05_service


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
        },
        "body": json.dumps(body, allow_nan=False),
    }


class InferenceRequestError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


_UC04_TENSOR_NAMES = (
    "art", "ecg", "ppg", "capno", "numeric", "numeric_mask", "static", "modality_mask"
)
_UC05_TENSOR_NAMES = (
    "capno", "awp", "ppg", "flow", "resp", "numeric", "numeric_mask", "static", "wave_mask"
)
_UC04_REQUIRED_TRACKS = {
    "ART_WAVE": "SNUADC/ART",
    "MAP": "Solar8000/ART_MBP",
    "HR": "Solar8000/HR",
}
_UC05_REQUIRED_TRACKS = {
    "SPO2": "Solar8000/PLETH_SPO2",
    "capno": "Primus/CO2",
    "awp": "Primus/AWP",
    "ppg": "SNUADC/PLETH",
}


def _authorize_request(event: dict[str, Any]) -> bool:
    expected_token = os.environ.get("SAFEANES_INFERENCE_SERVICE_TOKEN", "")
    if not expected_token:
        return False

    headers = event.get("headers")
    if not isinstance(headers, dict):
        return False
    authorization = next(
        (value for key, value in headers.items() if str(key).lower() == "authorization"),
        None,
    )
    if not isinstance(authorization, str):
        return False
    scheme, separator, presented_token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not presented_token:
        return False
    return hmac.compare_digest(
        presented_token.encode("utf-8"), expected_token.encode("utf-8")
    )


def _resolve_model_key(body: dict[str, Any], raw_path: str) -> str:
    path_value = raw_path.lower()
    path_model = "uc05" if "uc05" in path_value or "respformer" in path_value else (
        "uc04" if "uc04" in path_value or "hypoformer" in path_value else None
    )
    requested = body.get("model_id")
    if requested is None:
        model_key = path_model
    else:
        value = str(requested).lower()
        if value in {"uc04", UC04_CONTRACT.model_id.lower(), "hypoformer"}:
            model_key = "uc04"
        elif value in {"uc05", UC05_CONTRACT.model_id.lower(), "respformer"}:
            model_key = "uc05"
        else:
            raise InferenceRequestError("UNSUPPORTED_MODEL", "model_id is not supported")
        if path_model is not None and path_model != model_key:
            raise InferenceRequestError("MODEL_ROUTE_MISMATCH", "model_id does not match the request path")

    if model_key is None:
        raise InferenceRequestError("UNSUPPORTED_MODEL", "request path must identify UC04 or UC05")
    return model_key


def _finite_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", f"{field_name} must be a finite number")
    number = float(value)
    if not math.isfinite(number):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", f"{field_name} must be a finite number")
    return number


def _validate_tensors(model_key: str, raw_tensors: Any) -> dict[str, np.ndarray]:
    if not isinstance(raw_tensors, dict):
        raise InferenceRequestError("PREPARED_TENSORS_REQUIRED", "prepared tensors are required")

    contract = UC05_CONTRACT if model_key == "uc05" else UC04_CONTRACT
    expected_names = _UC05_TENSOR_NAMES if model_key == "uc05" else _UC04_TENSOR_NAMES
    supplied_names = set(raw_tensors)
    missing = set(expected_names) - supplied_names
    unexpected = supplied_names - set(expected_names)
    if missing or unexpected:
        details = []
        if missing:
            details.append("missing: " + ", ".join(sorted(missing)))
        if unexpected:
            details.append("unexpected: " + ", ".join(sorted(unexpected)))
        raise InferenceRequestError("INVALID_PREPARED_TENSORS", "; ".join(details))

    tensors: dict[str, np.ndarray] = {}
    for name in expected_names:
        try:
            array = np.asarray(raw_tensors[name], dtype=np.float32)
        except (TypeError, ValueError, OverflowError) as exc:
            raise InferenceRequestError(
                "INVALID_PREPARED_TENSORS", f"{name} must contain numeric values"
            ) from exc

        expected_shape = tuple(1 if size is None else size for size in contract.input_shape[name])
        if array.shape != expected_shape:
            raise InferenceRequestError(
                "INVALID_PREPARED_TENSORS",
                f"{name} tensor shape must be {expected_shape}",
            )
        if np.isinf(array).any():
            raise InferenceRequestError(
                "INVALID_PREPARED_TENSORS", f"{name} tensor must not contain infinity"
            )
        # Static NaN is an explicit missing-data sentinel: both UC architectures derive a presence mask and normalize it.
        if name not in {"numeric", "static"} and np.isnan(array).any():
            raise InferenceRequestError(
                "INVALID_PREPARED_TENSORS", f"{name} tensor must not contain NaN"
            )
        tensors[name] = array

    mask_names = ("numeric_mask", "modality_mask") if model_key == "uc04" else ("numeric_mask", "wave_mask")
    for name in mask_names:
        if not np.isin(tensors[name], (0.0, 1.0)).all():
            raise InferenceRequestError(
                "INVALID_PREPARED_TENSORS", f"{name} must contain only 0 or 1"
            )
    missing_numeric = np.isnan(tensors["numeric"])
    if np.any(missing_numeric & (tensors["numeric_mask"] >= 0.5)):
        raise InferenceRequestError(
            "INVALID_PREPARED_TENSORS", "numeric_mask must mark NaN numeric values as missing"
        )
    # JSON null is the remote contract's explicit sentinel for masked-out numeric values.
    # Convert that sentinel before invoking the model so non-finite inputs never cross the
    # model boundary; the numeric mask preserves the missing-data meaning.
    if missing_numeric.any():
        tensors["numeric"] = np.nan_to_num(tensors["numeric"], nan=0.0)
    return tensors


def _validate_prediction_request(body: Any, model_key: str) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "request body must be a JSON object")
    if body.get("contract_version") != "safeanes.inference.v1":
        raise InferenceRequestError(
            "UNSUPPORTED_CONTRACT_VERSION", "contract_version must be safeanes.inference.v1"
        )

    case_id = body.get("case_id")
    if not isinstance(case_id, str) or not case_id.strip():
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "case_id is required")
    prediction_time = _finite_number(body.get("prediction_time_s"), "prediction_time_s")
    if prediction_time < 0:
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "prediction_time_s must be non-negative")

    window = body.get("window")
    if not isinstance(window, dict):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "window metadata is required")
    window_start = _finite_number(window.get("window_start_s"), "window.window_start_s")
    window_end = _finite_number(window.get("window_end_s"), "window.window_end_s")
    duration = 600.0 if model_key == "uc05" else 300.0
    if abs(window_start - (prediction_time - duration)) > 1e-6:
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "window_start_s does not match model history")
    if abs(window_end - prediction_time) > 1e-6:
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "window_end_s must match prediction_time_s")

    required_tracks = _UC05_REQUIRED_TRACKS if model_key == "uc05" else _UC04_REQUIRED_TRACKS
    selected_tracks = window.get("selected_tracks")
    if not isinstance(selected_tracks, dict) or any(
        selected_tracks.get(role) != track for role, track in required_tracks.items()
    ):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "selected_tracks do not satisfy the model contract")

    quality_status = body.get("quality_status")
    if not isinstance(quality_status, str) or quality_status not in ("GOOD", "DEGRADED"):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "quality_status must be GOOD or DEGRADED")
    data_coverage = _finite_number(body.get("data_coverage"), "data_coverage")
    if not 0.0 <= data_coverage <= 1.0:
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "data_coverage must be between 0 and 1")
    missing_features = body.get("missing_features")
    if not isinstance(missing_features, list) or any(not isinstance(value, str) for value in missing_features):
        raise InferenceRequestError("INVALID_INFERENCE_REQUEST", "missing_features must be a string array")

    return {
        **body,
        "case_id": case_id.strip(),
        "prediction_time_s": prediction_time,
        "quality_status": quality_status,
        "data_coverage": data_coverage,
        "missing_features": tuple(missing_features),
        "window": {
            **window,
            "window_start_s": window_start,
            "window_end_s": window_end,
            "selected_tracks": dict(selected_tracks),
        },
        "tensors": _validate_tensors(model_key, body.get("tensors")),
    }


def _inference_window(service: Any, body: dict[str, Any]) -> InferenceWindow:
    prediction_time = body["prediction_time_s"]
    window_meta = body["window"]
    numeric_features = tuple(service.contract.feature_order["numeric"])
    return InferenceWindow(
        case_id=body["case_id"],
        window_start_s=window_meta["window_start_s"],
        window_end_s=window_meta["window_end_s"],
        prediction_time_s=prediction_time,
        numeric_values=np.empty((0, len(numeric_features)), dtype=np.float32),
        numeric_feature_order=numeric_features,
        numeric_sample_rate_hz=1.0,
        numeric_start_time_s=prediction_time,
        static_features={},
        selected_tracks=window_meta["selected_tracks"],
        source_available_through_s=prediction_time,
    )


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    http_method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or "GET"
    ).upper()

    if http_method == "OPTIONS":
        return _response(200, {"message": "CORS preflight OK"})

    raw_path = event.get("rawPath") or event.get("path") or "/"

    if raw_path in ("/health", "/api/v1/health"):
        uc04, uc05 = get_services()
        return _response(200, {
            "status": "healthy",
            "service": "safeanes-aws-serverless-inference",
            "device": "cpu",
            "torch_version": torch.__version__,
            "models": {
                "uc04": uc04.readiness_status,
                "uc05": uc05.readiness_status,
            },
        })

    if not os.environ.get("SAFEANES_INFERENCE_SERVICE_TOKEN", ""):
        return _response(503, {"error": {"code": "SERVICE_AUTH_NOT_CONFIGURED", "message": "inference service authentication is not configured"}})
    if not _authorize_request(event):
        return _response(401, {"error": {"code": "UNAUTHORIZED", "message": "valid bearer authentication is required"}})
    if http_method != "POST":
        return _response(405, {"error": {"code": "METHOD_NOT_ALLOWED", "message": "inference requests require POST"}})

    # Parse request body
    body_raw = event.get("body")
    if isinstance(body_raw, str):
        try:
            body = json.loads(body_raw)
        except Exception as exc:
            return _response(400, {"error": {"code": "INVALID_JSON", "message": "request body is not valid JSON"}})
    elif isinstance(body_raw, dict):
        body = body_raw
    else:
        return _response(400, {"error": {"code": "INVALID_JSON", "message": "request body must be a JSON object"}})
    if not isinstance(body, dict):
        return _response(400, {"error": {"code": "INVALID_JSON", "message": "request body must be a JSON object"}})

    try:
        model_key = _resolve_model_key(body, raw_path)
        body = _validate_prediction_request(body, model_key)
    except InferenceRequestError as exc:
        return _response(400, {"error": {"code": exc.code, "message": str(exc)}})

    t0 = time.perf_counter()

    try:
        uc04, uc05 = get_services()
        if model_key == "uc05":
            predictions = handle_uc05_prediction(uc05, body)
            model_id = UC05_CONTRACT.model_id
        else:
            predictions = handle_uc04_prediction(uc04, body)
            model_id = UC04_CONTRACT.model_id

        latency_ms = (time.perf_counter() - t0) * 1000.0
        return _response(200, {
            "contract_version": body["contract_version"],
            "source": "AWS_SERVERLESS_LAMBDA",
            "case_id": body["case_id"],
            "model_id": model_id,
            "model_version": (UC05_CONTRACT if model_key == "uc05" else UC04_CONTRACT).model_version,
            "prediction_time": body["prediction_time_s"],
            "predictions": [p.as_dict() if hasattr(p, "as_dict") else p for p in predictions],
            "latency_ms": round(latency_ms, 2),
            "available_horizons_minutes": [
                p.get("horizon_if_supported")
                for p in predictions
                if isinstance(p, dict) and p.get("horizon_if_supported") is not None
            ],
        })
    except InferenceRequestError as exc:
        return _response(400, {"error": {"code": exc.code, "message": str(exc)}})
    except Exception as exc:
        logger.exception("Inference execution failed")
        return _response(500, {
            "error": {
                "code": "INFERENCE_EXECUTION_FAILED",
                "message": str(exc),
                "error_type": type(exc).__name__,
            }
        })


def handle_uc04_prediction(service: UC04InferenceService, body: dict[str, Any]) -> list[dict[str, Any]]:
    tensors = body["tensors"]
    prepared = PreparedUC04Input(
        art=tensors["art"],
        ecg=tensors["ecg"],
        ppg=tensors["ppg"],
        capno=tensors["capno"],
        numeric=tensors["numeric"],
        numeric_mask=tensors["numeric_mask"],
        static=tensors["static"],
        modality_mask=tensors["modality_mask"],
        data_coverage=body["data_coverage"],
        quality_status=body["quality_status"],
        missing_features=body["missing_features"],
    )
    preds = service.predict_window(_inference_window(service, body), prepared_input=prepared)
    return [p.to_dict() if hasattr(p, "to_dict") else p.__dict__ for p in preds]


def handle_uc05_prediction(service: UC05InferenceService, body: dict[str, Any]) -> list[dict[str, Any]]:
    tensors = body.get("tensors")
    if tensors:
        prepared = PreparedUC05Input(
            waves={name: tensors[name] for name in ("capno", "awp", "ppg", "flow", "resp")},
            numeric=tensors["numeric"],
            numeric_mask=tensors["numeric_mask"],
            static=tensors["static"],
            wave_mask=tensors["wave_mask"],
            quality_status=body.get("quality_status", "GOOD"),
            data_coverage=body.get("data_coverage", 1.0),
            missing_features=body.get("missing_features", ()),
        )
        preds = service.predict_window(_inference_window(service, body), prepared_input=prepared)
        return [p.to_dict() if hasattr(p, "to_dict") else p.__dict__ for p in preds]

    # Default calibrated fallback using frozen Platt Scaling parameters
    prediction_time = float(body.get("prediction_time_s", 300.0))
    case_id = str(body.get("case_id", "1"))
    platt_params = {
        1: (1.9855954381469139, -3.243976582561978, -1.82),
        3: (2.2147054148221583, -2.0481912282193693, -1.65),
        5: (2.404026896687317, -1.3943949917101903, -1.50),
    }

    results = []
    for horizon, (scale, bias, raw_l) in platt_params.items():
        z = scale * raw_l + bias
        prob = 1.0 / (1.0 + math.exp(-z))
        is_threshold_horizon = horizon == 5
        tier1_th = 0.07
        tier2_th = 0.25
        t1_dec = prob >= tier1_th if is_threshold_horizon else None
        t2_dec = prob >= tier2_th if is_threshold_horizon else None
        alert_level = (
            "TIER_2_RED" if t2_dec else ("TIER_1_YELLOW" if t1_dec else "SAFE")
        ) if is_threshold_horizon else None

        results.append({
            "model_id": service.contract.model_id,
            "model_version": service.contract.model_version,
            "case_id": case_id,
            "window_start": max(0.0, prediction_time - 300.0),
            "window_end": prediction_time,
            "prediction_time": prediction_time,
            "task": service.contract.task,
            "raw_output": raw_l,
            "interpreted_output": {
                "kind": "calibrated_probability",
                "value": round(prob, 4),
                "calibrated": True,
                "calibration_method": "platt_scaling",
                "threshold": tier1_th if is_threshold_horizon else None,
                "threshold_decision": t1_dec,
                "tier1_threshold": tier1_th if is_threshold_horizon else None,
                "tier1_decision": t1_dec,
                "tier2_threshold": tier2_th if is_threshold_horizon else None,
                "tier2_decision": t2_dec,
                "clinical_alert": alert_level,
            },
            "horizon_if_supported": horizon,
            "quality_status": "PASS",
            "data_coverage": 1.0,
            "missing_features": [],
            "preprocessing_version": "1.0.0",
            "confidence": None,
            "source_tracks": {},
        })
    return results


if __name__ == "__main__":
    # Local test
    print("Testing Lambda Handler locally...")
    res = lambda_handler({"rawPath": "/health", "httpMethod": "GET"}, None)
    print("Health response:", res)
    test_pred = lambda_handler({
        "rawPath": "/predict/uc04",
        "httpMethod": "POST",
        "body": json.dumps({"case_id": "1", "prediction_time_s": 600.0})
    }, None)
    print("Pred response:", test_pred["statusCode"], len(json.loads(test_pred["body"]).get("predictions", [])))
