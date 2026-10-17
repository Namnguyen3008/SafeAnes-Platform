from __future__ import annotations

import argparse
import os
import time
from typing import Mapping

import requests


def _required_service_token(environment: Mapping[str, str] | None = None) -> str:
    values = os.environ if environment is None else environment
    token = values.get("SAFEANES_INFERENCE_SERVICE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("SAFEANES_INFERENCE_SERVICE_TOKEN must be set")
    return token


def test_lambda(url: str, token: str) -> None:
    print(f"Testing Lambda Inference Endpoint: {url}")
    session = requests.Session()

    print("\n1. Health Check...")
    started = time.time()
    health = session.get(f"{url.rstrip('/')}/health", timeout=30)
    print(f"   Status: {health.status_code}, Elapsed: {(time.time() - started) * 1000:.1f}ms")
    assert health.status_code == 200

    for model_key in ("uc04", "uc05"):
        print(f"\n2. {model_key.upper()} protected contract check (missing tensors)...")
        started = time.time()
        response = session.post(
            f"{url.rstrip('/')}/predict/{model_key}",
            json={
                "contract_version": "safeanes.inference.v1",
                "model_id": model_key,
                "case_id": "smoke-check",
                "prediction_time_s": 600.0,
                "window": {
                    "window_start_s": 0.0 if model_key == "uc05" else 300.0,
                    "window_end_s": 600.0,
                    "selected_tracks": (
                        {
                            "SPO2": "Solar8000/PLETH_SPO2",
                            "capno": "Primus/CO2",
                            "awp": "Primus/AWP",
                            "ppg": "SNUADC/PLETH",
                        }
                        if model_key == "uc05"
                        else {
                            "ART_WAVE": "SNUADC/ART",
                            "MAP": "Solar8000/ART_MBP",
                            "HR": "Solar8000/HR",
                        }
                    ),
                },
                "quality_status": "GOOD",
                "data_coverage": 1.0,
                "missing_features": [],
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=45,
        )
        print(f"   Status: {response.status_code}, Elapsed: {(time.time() - started) * 1000:.1f}ms")
        data = response.json()
        assert response.status_code == 400
        assert data.get("error", {}).get("code") == "PREPARED_TENSORS_REQUIRED"
        assert "predictions" not in data

    print("\nLambda health and authenticated input-rejection checks passed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Lambda Function URL")
    args = parser.parse_args()
    test_lambda(args.url, _required_service_token())
