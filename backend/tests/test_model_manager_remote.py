from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock

import numpy as np
import pytest

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError
from backend.app.ml.contracts.prediction import ModelPrediction
from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.preprocessing.vitaldb_pipeline import WindowPreprocessingResult
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.services.inference.model_manager import ModelManager


def _contract(model_id: str):
    return UC05_CONTRACT if model_id == UC05_CONTRACT.model_id else UC04_CONTRACT


def _model_tensors(model_id: str) -> dict[str, np.ndarray]:
    contract = _contract(model_id)
    names = (
        ("capno", "awp", "ppg", "flow", "resp", "numeric", "numeric_mask", "static", "wave_mask")
        if contract.model_id == UC05_CONTRACT.model_id
        else ("art", "ecg", "ppg", "capno", "numeric", "numeric_mask", "static", "modality_mask")
    )
    tensors = {
        name: np.zeros(
            tuple(1 if size is None else size for size in contract.input_shape[name]),
            dtype=np.float32,
        )
        for name in names
    }
    if contract.model_id == UC05_CONTRACT.model_id:
        tensors["wave_mask"][:] = np.asarray([[1, 1, 1, 0, 0]], dtype=np.float32)
    return tensors


def _window(model_id: str) -> InferenceWindow:
    contract = _contract(model_id)
    uc05 = contract.model_id == UC05_CONTRACT.model_id
    prediction_time = 600.0
    start_time = prediction_time - contract.window_seconds["numeric"]
    selected_tracks = (
        {
            "SPO2": "Solar8000/PLETH_SPO2",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
            "ppg": "SNUADC/PLETH",
        }
        if uc05
        else {
            "ART_WAVE": "SNUADC/ART",
            "MAP": "Solar8000/ART_MBP",
            "HR": "Solar8000/HR",
        }
    )
    return InferenceWindow(
        case_id="case-1",
        window_start_s=start_time,
        window_end_s=prediction_time,
        prediction_time_s=prediction_time,
        numeric_values=np.zeros((contract.window_seconds["numeric"], len(contract.feature_order["numeric"])), dtype=np.float32),
        numeric_feature_order=tuple(contract.feature_order["numeric"]),
        numeric_sample_rate_hz=1.0,
        numeric_start_time_s=start_time,
        static_features={},
        selected_tracks=selected_tracks,
        source_available_through_s=prediction_time,
    )


class _Cases:
    def get_case(self, case_id: str) -> dict[str, Any]:
        assert case_id == "case-1"
        return {"duration_seconds": 1200.0}


class _Series:
    def __init__(self, window: InferenceWindow) -> None:
        self.window = window

    def window_at(self, prediction_time_s: float) -> InferenceWindow:
        assert prediction_time_s == self.window.prediction_time_s
        return self.window


class _VitalDB:
    def __init__(self, window: InferenceWindow) -> None:
        self.cases = _Cases()
        self.series = _Series(window)

    def get_model_series(self, case_id: str, model_id: str) -> _Series:
        assert case_id == self.series.window.case_id
        assert model_id == _contract(model_id).model_id
        return self.series


class _LambdaClient:
    def __init__(self, error: ApiServiceError | None = None) -> None:
        self.payloads: list[dict[str, Any]] = []
        self.error = error

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.payloads.append(payload)
        if self.error is not None:
            raise self.error
        contract = _contract(payload["model_id"])
        prediction = ModelPrediction(
            model_id=contract.model_id,
            model_version=contract.model_version,
            case_id=payload["case_id"],
            window_start=payload["window"]["window_start_s"],
            window_end=payload["window"]["window_end_s"],
            prediction_time=payload["prediction_time_s"],
            task=contract.task,
            raw_output=0.25,
            interpreted_output={"kind": "test_score", "value": 0.56, "calibrated": False},
            horizon_if_supported=5,
            quality_status=payload["quality_status"],
            data_coverage=payload["data_coverage"],
            missing_features=tuple(payload["missing_features"]),
            preprocessing_version="test-preprocessor-v1",
            source_tracks=payload["window"]["selected_tracks"],
        )
        return {
            "contract_version": payload["contract_version"],
            "source": "AWS_SERVERLESS_LAMBDA",
            "model_id": contract.model_id,
            "model_version": contract.model_version,
            "case_id": payload["case_id"],
            "prediction_time": payload["prediction_time_s"],
            "latency_ms": 2.5,
            "available_horizons_minutes": [5],
            "predictions": [prediction.as_dict()],
        }


def _manager(
    tmp_path: Any,
    model_id: str,
    client: _LambdaClient,
    *,
    eligible: bool = True,
) -> tuple[ModelManager, _Series]:
    window = _window(model_id)
    settings = Settings(
        data_root=tmp_path / "data",
        model_root=tmp_path / "models",
        inference_url="https://lambda.example",
        offload_inference=True,
        inference_service_token="test-service-token",
    )
    manager = ModelManager(
        settings,
        _VitalDB(window),
        load_models=False,
        lambda_client=client,
    )
    tensors = _model_tensors(model_id) if eligible else {}
    prepared = SimpleNamespace(
        quality_status="GOOD",
        data_coverage=0.92,
        missing_features=(),
    ) if eligible else None
    report = {
        "input_eligible": eligible,
        "inference_eligible": eligible,
        "quality": {"status": "GOOD"},
        "abstain_reasons": [],
        "model_readiness_blockers": [],
    }
    result = WindowPreprocessingResult(prepared, tensors, report)
    manager.preprocessor.prepare = Mock(return_value=result)
    return manager, _VitalDB(window).series



@pytest.mark.parametrize(
    "field,value",
    [
        ("contract_version", "safeanes.inference.v0"),
        ("source", "OFFLINE_CACHE"),
        ("model_id", "another-model"),
        ("model_version", "old-model-version"),
        ("case_id", "another-case"),
        ("prediction_time", 601.0),
        ("available_horizons_minutes", []),
        ("latency_ms", -1.0),
        ("latency_ms", None),
    ],
)
def test_remote_predict_rejects_response_envelope_mismatch(
    tmp_path: Any, field: str, value: Any
) -> None:
    model_id = UC04_CONTRACT.model_id
    client = _LambdaClient()
    original_predict = client.predict

    def mismatched_response(payload: dict[str, Any]) -> dict[str, Any]:
        response = original_predict(payload)
        response[field] = value
        return response

    client.predict = mismatched_response
    manager, _ = _manager(tmp_path, model_id, client)

    with pytest.raises(ApiServiceError) as raised:
        manager.predict("case-1", model_id, 600.0)

    assert raised.value.code == "INFERENCE_FAILED"



def test_model_manager_rejects_missing_offload_url_before_model_setup() -> None:
    settings = SimpleNamespace(
        offload_inference=True,
        inference_url=None,
        inference_service_token="test-service-token",
    )

    with pytest.raises(ValueError, match="SAFEANES_INFERENCE_URL"):
        ModelManager(settings, object(), load_models=True)


@pytest.mark.parametrize("model_id", [UC04_CONTRACT.model_id, UC05_CONTRACT.model_id])
def test_remote_predict_sends_prepared_model_tensors(
    tmp_path: Any, model_id: str
) -> None:
    client = _LambdaClient()
    manager, _ = _manager(tmp_path, model_id, client)

    predictions = manager.predict("case-1", model_id, 600.0)

    payload = client.payloads[0]
    contract = _contract(model_id)
    expected_window = _window(model_id)
    assert payload["contract_version"] == "safeanes.inference.v1"
    assert payload["model_id"] == contract.model_id
    assert payload["case_id"] == "case-1"
    assert payload["prediction_time_s"] == 600.0
    assert payload["window"]["window_start_s"] == expected_window.window_start_s
    assert payload["window"]["window_end_s"] == 600.0
    assert payload["window"]["selected_tracks"] == dict(expected_window.selected_tracks)
    assert payload["quality_status"] == "GOOD"
    assert payload["data_coverage"] == 0.92
    assert set(payload["tensors"]) == set(_model_tensors(model_id))
    for name, expected_shape in contract.input_shape.items():
        if name not in payload["tensors"]:
            continue
        array = np.asarray(payload["tensors"][name], dtype=np.float32)
        assert array.shape == tuple(1 if size is None else size for size in expected_shape)
        assert np.isfinite(array).all()
    json.dumps(payload, allow_nan=False)
    assert predictions[0]["case_id"] == "case-1"
    assert predictions[0]["artifact_hash"] == contract.artifact_sha256


@pytest.mark.parametrize(
    "model_id,model_key,path,handler_name",
    [
        (UC04_CONTRACT.model_id, "uc04", "/predict/uc04", "handle_uc04_prediction"),
        (UC05_CONTRACT.model_id, "uc05", "/predict/uc05", "handle_uc05_prediction"),
    ],
)
def test_static_missing_round_trips_from_backend_contract_to_lambda(
    monkeypatch: Any,
    model_id: str,
    model_key: str,
    path: str,
    handler_name: str,
) -> None:
    from aws.lambda_inference import app as lambda_app
    from backend.app.services.inference.model_manager import _remote_inference_payload

    contract = _contract(model_id)
    tensors = _model_tensors(model_id)
    tensors["static"][0, 0] = np.nan
    prepared = SimpleNamespace(
        prepared=SimpleNamespace(
            quality_status="DEGRADED",
            data_coverage=0.75,
            missing_features=("static:age",),
        ),
        model_tensors=tensors,
    )
    request = _remote_inference_payload(
        contract=contract,
        case_id="case-1",
        window=_window(model_id),
        prepared=prepared,
    )
    request_json = json.dumps(request, allow_nan=False)
    decoded_request = json.loads(request_json)
    assert decoded_request["tensors"]["static"][0][0] is None

    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", "test-service-token")
    observed: dict[str, Any] = {}

    def capture_model_input(_service: Any, model_request: dict[str, Any]) -> list[dict[str, Any]]:
        observed["static"] = model_request["tensors"]["static"].copy()
        return []

    monkeypatch.setattr(lambda_app, "get_services", lambda: (object(), object()))
    monkeypatch.setattr(lambda_app, handler_name, capture_model_input)
    response = lambda_app.lambda_handler(
        {
            "httpMethod": "POST",
            "path": path,
            "headers": {"Authorization": "Bearer test-service-token"},
            "body": request_json,
        },
        None,
    )

    assert response["statusCode"] == 200
    assert np.isnan(observed["static"][0, 0])
    assert _decode_response(response)["predictions"] == []


def _decode_response(response: dict[str, Any]) -> dict[str, Any]:
    return json.loads(response["body"] or "{}")


def test_remote_predict_encodes_intentional_missing_values_as_json_null(tmp_path: Any) -> None:
    model_id = UC04_CONTRACT.model_id
    client = _LambdaClient()
    manager, _ = _manager(tmp_path, model_id, client)
    original_prepare = manager.preprocessor.prepare

    def prepare_with_missing_static(*args: Any, **kwargs: Any) -> WindowPreprocessingResult:
        result = original_prepare(*args, **kwargs)
        result.model_tensors["static"][0, 0] = np.nan
        return result

    manager.preprocessor.prepare = prepare_with_missing_static

    manager.predict("case-1", model_id, 600.0)

    assert client.payloads[0]["tensors"]["static"][0][0] is None
    json.dumps(client.payloads[0], allow_nan=False)


def test_remote_predict_abstains_on_ineligible_input_without_calling_lambda(tmp_path: Any) -> None:
    model_id = UC04_CONTRACT.model_id
    client = _LambdaClient()
    manager, _ = _manager(tmp_path, model_id, client, eligible=False)

    with pytest.raises(ApiServiceError) as raised:
        manager.predict("case-1", model_id, 600.0)

    assert raised.value.code == "INPUT_NOT_ELIGIBLE"
    assert client.payloads == []


def test_remote_error_does_not_fall_back_to_local_inference_or_cache(tmp_path: Any) -> None:
    model_id = UC04_CONTRACT.model_id
    client = _LambdaClient(
        ApiServiceError("REMOTE_INFERENCE_TIMEOUT", "Remote inference timed out", status_code=504)
    )
    manager, _ = _manager(tmp_path, model_id, client)
    local_predict = Mock(side_effect=AssertionError("local inference fallback was called"))
    manager.services[model_id].predict_window = local_predict

    with pytest.raises(ApiServiceError) as raised:
        manager.predict("case-1", model_id, 600.0)

    assert raised.value.code == "INFERENCE_FAILED"
    assert client.payloads
    local_predict.assert_not_called()
