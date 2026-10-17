from __future__ import annotations

import json
import math
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
import urllib.request

from backend.app.core.errors import ApiServiceError


_CONTRACT_VERSION = "safeanes.inference.v1"


class LambdaInferenceClient:
    """Authenticated JSON transport for the SafeAnes Lambda inference contract."""

    def __init__(
        self,
        function_url: str,
        service_token: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        parsed_url = urlsplit(function_url) if isinstance(function_url, str) else None
        if (
            parsed_url is None
            or parsed_url.scheme not in {"http", "https"}
            or not parsed_url.netloc
            or parsed_url.query
            or parsed_url.fragment
            or parsed_url.username is not None
            or parsed_url.password is not None
        ):
            raise ValueError("function_url must be an HTTP(S) URL without embedded credentials")
        if not isinstance(service_token, str) or not service_token or not service_token.isascii() or any(
            character.isspace() for character in service_token
        ):
            raise ValueError("service_token must contain ASCII non-whitespace characters")
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, (int, float))
            or not math.isfinite(float(timeout_seconds))
            or float(timeout_seconds) <= 0
        ):
            raise ValueError("timeout_seconds must be a positive finite number")

        self._function_url = function_url.rstrip("/")
        self._service_token = service_token
        self._timeout_seconds = float(timeout_seconds)

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict) or payload.get("contract_version") != _CONTRACT_VERSION:
            raise ApiServiceError(
                "INVALID_INFERENCE_REQUEST",
                "Remote inference requires contract_version safeanes.inference.v1",
                status_code=422,
            )

        model_id = payload.get("model_id")
        if not isinstance(model_id, str):
            raise ApiServiceError(
                "INVALID_INFERENCE_REQUEST",
                "Remote inference requires a supported model_id",
                status_code=422,
            )
        normalized_model = model_id.casefold()
        if normalized_model in {"uc04", "safeanes-uc04-hypoformer", "hypoformer"}:
            model_slug = "uc04"
        elif normalized_model in {"uc05", "safeanes-uc05-respformer", "respformer"}:
            model_slug = "uc05"
        else:
            raise ApiServiceError(
                "INVALID_INFERENCE_REQUEST",
                "Remote inference requires a supported model_id",
                status_code=422,
            )

        try:
            request_body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
        except (TypeError, ValueError, OverflowError) as exc:
            raise ApiServiceError(
                "INVALID_INFERENCE_REQUEST",
                "Remote inference payload must contain finite JSON values",
                status_code=422,
            ) from exc

        request = urllib.request.Request(
            f"{self._function_url}/predict/{model_slug}",
            data=request_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._service_token}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:
                status_code = getattr(response, "status", None)
                if status_code is None:
                    getcode = getattr(response, "getcode", None)
                    status_code = getcode() if callable(getcode) else 200
                if not 200 <= int(status_code) < 300:
                    raise ApiServiceError(
                        "REMOTE_INFERENCE_FAILED",
                        "Remote inference returned a non-success status",
                        status_code=502,
                        details={"upstream_status": int(status_code)},
                    )
                response_body = response.read()
        except ApiServiceError:
            raise
        except HTTPError as exc:
            raise ApiServiceError(
                "REMOTE_INFERENCE_FAILED",
                "Remote inference returned a non-success status",
                status_code=502,
                details={"upstream_status": int(exc.code)},
            ) from None
        except (TimeoutError, socket.timeout):
            raise ApiServiceError(
                "REMOTE_INFERENCE_TIMEOUT",
                "Remote inference timed out",
                status_code=504,
            ) from None
        except URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise ApiServiceError(
                    "REMOTE_INFERENCE_TIMEOUT",
                    "Remote inference timed out",
                    status_code=504,
                ) from None
            raise ApiServiceError(
                "REMOTE_INFERENCE_UNAVAILABLE",
                "Remote inference is unavailable",
                status_code=502,
            ) from None
        except OSError:
            raise ApiServiceError(
                "REMOTE_INFERENCE_UNAVAILABLE",
                "Remote inference is unavailable",
                status_code=502,
            ) from None
        except Exception:
            raise ApiServiceError(
                "REMOTE_INFERENCE_FAILED",
                "Remote inference request failed",
                status_code=502,
            ) from None

        try:
            decoded = json.loads(response_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference returned invalid JSON",
                status_code=502,
            ) from None
        expected_model_id = "SafeAnes-UC04-HypoFormer" if model_slug == "uc04" else "SafeAnes-UC05-RespFormer"
        expected_prediction_time = payload.get("prediction_time_s")
        if (
            not isinstance(decoded, dict)
            or decoded.get("contract_version") != _CONTRACT_VERSION
            or decoded.get("source") != "AWS_SERVERLESS_LAMBDA"
            or decoded.get("model_id") != expected_model_id
            or decoded.get("case_id") != payload.get("case_id")
            or not isinstance(decoded.get("model_version"), str)
            or not decoded["model_version"].strip()
            or isinstance(expected_prediction_time, bool)
            or not isinstance(expected_prediction_time, (int, float))
            or not math.isfinite(float(expected_prediction_time))
        ):
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference response did not match the expected contract",
                status_code=502,
            )

        response_prediction_time = decoded.get("prediction_time")
        if (
            isinstance(response_prediction_time, bool)
            or not isinstance(response_prediction_time, (int, float))
            or not math.isfinite(float(response_prediction_time))
            or not math.isclose(
                float(response_prediction_time),
                float(expected_prediction_time),
                rel_tol=0.0,
                abs_tol=1e-6,
            )
        ):
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference response did not match the expected contract",
                status_code=502,
            )

        response_latency_ms = decoded.get("latency_ms")
        if (
            isinstance(response_latency_ms, bool)
            or not isinstance(response_latency_ms, (int, float))
            or not math.isfinite(float(response_latency_ms))
            or float(response_latency_ms) < 0
        ):
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference response did not match the expected contract",
                status_code=502,
            )

        predictions = decoded.get("predictions")
        horizons = decoded.get("available_horizons_minutes")
        if (
            not isinstance(predictions, list)
            or not all(isinstance(row, dict) for row in predictions)
            or not isinstance(horizons, list)
            or any(type(horizon) is not int or horizon <= 0 for horizon in horizons)
            or len(horizons) != len(set(horizons))
        ):
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference response did not match the expected contract",
                status_code=502,
            )

        row_horizons: list[int] = []
        for row in predictions:
            horizon = row.get("horizon_if_supported")
            if horizon is None:
                continue
            if type(horizon) is not int or horizon <= 0:
                raise ApiServiceError(
                    "REMOTE_INFERENCE_INVALID_RESPONSE",
                    "Remote inference response did not match the expected contract",
                    status_code=502,
                )
            row_horizons.append(horizon)
        if horizons != row_horizons:
            raise ApiServiceError(
                "REMOTE_INFERENCE_INVALID_RESPONSE",
                "Remote inference response did not match the expected contract",
                status_code=502,
            )
        return decoded
