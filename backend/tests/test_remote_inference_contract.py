from __future__ import annotations

import json
from io import BytesIO
from typing import Any
from urllib.error import HTTPError

import pytest

from backend.app.core.errors import ApiServiceError
from backend.app.services.inference import lambda_client
from backend.app.services.inference.lambda_client import LambdaInferenceClient


TOKEN = "private-lambda-service-token"


class _Response:
    def __init__(self, body: bytes, status: int = 200) -> None:
        self._body = body
        self.status = status

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def _payload(model_id: str = "SafeAnes-UC04-HypoFormer") -> dict[str, Any]:
    return {
        "contract_version": "safeanes.inference.v1",
        "model_id": model_id,
        "case_id": "case-1",
        "prediction_time_s": 600.0,
    }


@pytest.mark.parametrize(
    "model_id,slug",
    [("SafeAnes-UC04-HypoFormer", "uc04"), ("SafeAnes-UC05-RespFormer", "uc05")],
)
def test_lambda_client_sends_versioned_payload_and_bearer_token(
    monkeypatch: pytest.MonkeyPatch, model_id: str, slug: str
) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, *, timeout: float) -> _Response:
        captured["request"] = request
        captured["timeout"] = timeout
        return _Response(b'{"predictions": []}')

    monkeypatch.setattr(lambda_client.urllib.request, "urlopen", fake_urlopen)
    client = LambdaInferenceClient("https://lambda.example/", TOKEN)

    payload = _payload(model_id)
    result = client.predict(payload)

    request = captured["request"]
    assert request.full_url == f"https://lambda.example/predict/{slug}"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == f"Bearer {TOKEN}"
    assert request.get_header("Content-type") == "application/json"
    assert json.loads(request.data) == payload
    assert captured["timeout"] == 10.0
    assert result == {"predictions": []}


def test_lambda_client_maps_timeout_to_sanitized_inference_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, float] = {}

    def timeout(request: Any, *, timeout: float) -> None:
        captured["timeout"] = timeout
        raise TimeoutError(f"request unexpectedly included {TOKEN}")

    monkeypatch.setattr(lambda_client.urllib.request, "urlopen", timeout)
    client = LambdaInferenceClient("https://lambda.example", TOKEN)

    with pytest.raises(ApiServiceError) as raised:
        client.predict(_payload())

    assert raised.value.code == "REMOTE_INFERENCE_TIMEOUT"
    assert raised.value.status_code == 504
    assert TOKEN not in str(raised.value)
    assert captured["timeout"] == 10.0


@pytest.mark.parametrize("failure", ["http_error", "invalid_json"])
def test_lambda_client_rejects_non_2xx_and_invalid_json(
    monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    def fake_urlopen(request: Any, *, timeout: float) -> _Response:
        if failure == "http_error":
            raise HTTPError(request.full_url, 403, "Forbidden", {}, BytesIO(TOKEN.encode()))
        return _Response(f"not json {TOKEN}".encode())

    monkeypatch.setattr(lambda_client.urllib.request, "urlopen", fake_urlopen)
    client = LambdaInferenceClient("https://lambda.example", TOKEN)

    with pytest.raises(ApiServiceError) as raised:
        client.predict(_payload())

    assert raised.value.code in {"REMOTE_INFERENCE_FAILED", "REMOTE_INFERENCE_INVALID_RESPONSE"}
    assert raised.value.status_code == 502
    assert TOKEN not in str(raised.value)
