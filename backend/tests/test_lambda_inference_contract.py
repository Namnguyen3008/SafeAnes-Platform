from __future__ import annotations

import json
from typing import Any

import numpy as np
import pytest

from aws.lambda_inference import app
from aws.scripts import test_lambda_inference as lambda_smoke
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.uc04 import PreparedUC04Input
from backend.app.ml.preprocessing.uc05 import PreparedUC05Input


TOKEN = "lambda-service-token-for-tests"
CONTRACT_VERSION = "safeanes.inference.v1"


def _event(
    body: dict[str, Any] | None = None,
    *,
    path: str = "/predict/uc04",
    token: str | None = TOKEN,
) -> dict[str, Any]:
    headers = {"content-type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    return {
        "rawPath": path,
        "httpMethod": "POST",
        "headers": headers,
        "body": json.dumps(
            body or {},
            default=lambda value: value.tolist()
            if isinstance(value, np.ndarray)
            else TypeError(f"cannot encode {type(value).__name__}"),
        ),
    }


def _body(model_id: str = "uc04") -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "model_id": model_id,
        "case_id": "case-1",
        "prediction_time_s": 600.0,
        "quality_status": "GOOD",
        "data_coverage": 1.0,
        "missing_features": [],
    }


def _prepared_tensors(model_id: str) -> dict[str, np.ndarray]:
    contract = app.UC05_CONTRACT if model_id == "uc05" else app.UC04_CONTRACT
    names = (
        ("capno", "awp", "ppg", "flow", "resp", "numeric", "numeric_mask", "static", "wave_mask")
        if model_id == "uc05"
        else ("art", "ecg", "ppg", "capno", "numeric", "numeric_mask", "static", "modality_mask")
    )
    return {
        name: np.zeros(tuple(1 if size is None else size for size in contract.input_shape[name]), dtype=np.float32)
        for name in names
    }


def _window(model_id: str) -> dict[str, Any]:
    selected_tracks = (
        {
            "SPO2": "Solar8000/PLETH_SPO2",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
            "ppg": "SNUADC/PLETH",
            "flow": "Primus/Flow",
            "resp": "Primus/RESP",
        }
        if model_id == "uc05"
        else {
            "ART_WAVE": "SNUADC/ART",
            "MAP": "Solar8000/ART_MBP",
            "HR": "Solar8000/HR",
        }
    )
    return {
        "window_start_s": 0.0 if model_id == "uc05" else 300.0,
        "window_end_s": 600.0,
        "selected_tracks": selected_tracks,
    }


def _services() -> tuple[UC04InferenceService, UC05InferenceService]:
    services = []
    for service_type in (UC04InferenceService, UC05InferenceService):
        service = service_type.__new__(service_type)
        service.readiness_status = "INTEGRATION_READY"
        service.inference_test_inputs = []

        def fake_predict(window: Any, *, prepared_input: Any, service: Any = service) -> list[Any]:
            service.validate_inputs(window)
            service.inference_test_inputs.append(prepared_input)
            return []

        service.predict_window = fake_predict
        services.append(service)
    return services[0], services[1]


def _decode(response: dict[str, Any]) -> dict[str, Any]:
    return json.loads(response["body"])


@pytest.mark.parametrize("provided_token", [None, "wrong-token"])
def test_prediction_requires_valid_service_token(
    monkeypatch: pytest.MonkeyPatch, provided_token: str | None
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded before auth"))

    response = app.lambda_handler(_event(_body(), token=provided_token), None)

    assert response["statusCode"] == 401
    assert (provided_token or TOKEN) not in response["body"]


def test_missing_service_token_configuration_returns_service_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SAFEANES_INFERENCE_SERVICE_TOKEN", raising=False)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded without auth configuration"))

    response = app.lambda_handler(_event(_body()), None)

    assert response["statusCode"] == 503
    assert "predictions" not in _decode(response)


def test_health_endpoint_remains_available_without_service_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SAFEANES_INFERENCE_SERVICE_TOKEN", raising=False)
    monkeypatch.setattr(app, "get_services", _services)

    response = app.lambda_handler({"rawPath": "/health", "httpMethod": "GET"}, None)

    assert response["statusCode"] == 200
    assert _decode(response)["status"] == "healthy"


def test_cors_preflight_remains_available_without_service_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SAFEANES_INFERENCE_SERVICE_TOKEN", raising=False)

    response = app.lambda_handler({"rawPath": "/predict/uc04", "httpMethod": "OPTIONS"}, None)

    assert response["statusCode"] == 200
    assert _decode(response)["message"] == "CORS preflight OK"


@pytest.mark.parametrize("model_id,path", [("uc04", "/predict/uc04"), ("uc05", "/predict/uc05")])
def test_prediction_rejects_missing_prepared_tensors(
    monkeypatch: pytest.MonkeyPatch, model_id: str, path: str
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded for missing tensors"))
    body = _body(model_id)
    body.update({"window": _window(model_id)})

    response = app.lambda_handler(_event(body, path=path), None)

    assert response["statusCode"] == 400
    assert "predictions" not in _decode(response)


def test_case_and_time_without_prepared_contract_never_produce_predictions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded for metadata-only request"))

    response = app.lambda_handler(
        _event({"case_id": "case-1", "prediction_time_s": 600.0}), None
    )

    assert response["statusCode"] == 400
    assert "predictions" not in _decode(response)


def test_prediction_rejects_unknown_contract_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded for unknown contract"))
    body = _body()
    body["contract_version"] = "safeanes.inference.v0"
    body["tensors"] = _prepared_tensors("uc04")
    body["window"] = _window("uc04")

    response = app.lambda_handler(_event(body), None)

    assert response["statusCode"] == 400
    assert "predictions" not in _decode(response)


@pytest.mark.parametrize("bad_value", [float("nan"), float("inf"), float("-inf")])
def test_prediction_rejects_non_finite_waveform_tensors(
    monkeypatch: pytest.MonkeyPatch, bad_value: float
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded for invalid tensors"))
    body = _body()
    tensors = _prepared_tensors("uc04")
    tensors["art"][0, 0] = bad_value
    body.update({"tensors": tensors, "window": _window("uc04")})

    response = app.lambda_handler(_event(body), None)

    assert response["statusCode"] == 400
    assert "predictions" not in _decode(response)


@pytest.mark.parametrize("model_id,path,tensor_name", [("uc04", "/predict/uc04", "art"), ("uc05", "/predict/uc05", "ppg")])
def test_prediction_rejects_wrong_tensor_shape(
    monkeypatch: pytest.MonkeyPatch, model_id: str, path: str, tensor_name: str
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(app, "get_services", lambda: pytest.fail("models loaded for invalid tensor shape"))
    body = _body(model_id)
    tensors = _prepared_tensors(model_id)
    tensors[tensor_name] = tensors[tensor_name][:, :-1]
    body.update({"tensors": tensors, "window": _window(model_id)})

    response = app.lambda_handler(_event(body, path=path), None)

    assert response["statusCode"] == 400
    assert "predictions" not in _decode(response)


@pytest.mark.parametrize("model_id,path", [("uc04", "/predict/uc04"), ("uc05", "/predict/uc05")])
def test_complete_prepared_contract_reaches_model_without_default_predictions(
    monkeypatch: pytest.MonkeyPatch, model_id: str, path: str
) -> None:
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", TOKEN)
    services = _services()
    monkeypatch.setattr(app, "get_services", lambda: services)
    body = _body(model_id)
    body.update({"tensors": _prepared_tensors(model_id), "window": _window(model_id)})

    response = app.lambda_handler(_event(body, path=path), None)

    assert response["statusCode"] == 200
    assert _decode(response)["predictions"] == []
    service = services[1] if model_id == "uc05" else services[0]
    other_service = services[0] if model_id == "uc05" else services[1]
    assert len(service.inference_test_inputs) == 1
    assert other_service.inference_test_inputs == []
    prepared = service.inference_test_inputs[0]
    expected_type = PreparedUC05Input if model_id == "uc05" else PreparedUC04Input
    assert isinstance(prepared, expected_type)
    assert prepared.numeric.dtype == np.float32


def test_lambda_smoke_requires_service_token() -> None:
    with pytest.raises(RuntimeError, match="SAFEANES_INFERENCE_SERVICE_TOKEN"):
        lambda_smoke._required_service_token({})


def test_lambda_smoke_sends_token_only_as_authorization_header(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    class Response:
        def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
            self.status_code = status_code
            self.payload = payload

        def json(self) -> dict[str, Any]:
            return self.payload

    class Session:
        def __init__(self) -> None:
            self.get_calls: list[tuple[str, dict[str, Any]]] = []
            self.post_calls: list[tuple[str, dict[str, Any]]] = []

        def get(self, url: str, **kwargs: Any) -> Response:
            self.get_calls.append((url, kwargs))
            return Response(200, {"status": "healthy"})

        def post(self, url: str, **kwargs: Any) -> Response:
            self.post_calls.append((url, kwargs))
            return Response(400, {"error": {"code": "PREPARED_TENSORS_REQUIRED"}})

    session = Session()
    monkeypatch.setattr(lambda_smoke.requests, "Session", lambda: session)

    lambda_smoke.test_lambda("https://lambda.example", TOKEN)

    assert len(session.get_calls) == 1
    assert "headers" not in session.get_calls[0][1]
    assert len(session.post_calls) == 2
    assert all(
        call[1]["headers"] == {"Authorization": f"Bearer {TOKEN}"}
        and "tensors" not in call[1]["json"]
        for call in session.post_calls
    )
    assert TOKEN not in capsys.readouterr().out
