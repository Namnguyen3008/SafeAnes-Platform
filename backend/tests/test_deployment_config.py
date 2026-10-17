from pathlib import Path

import yaml
import pytest

from aws.scripts import test_lambda_inference

ROOT = Path(__file__).resolve().parents[2]


def _backend_service() -> dict:
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
    return next(service for service in blueprint["services"] if service.get("name") == "safeanes-backend")


def _env_vars(service: dict) -> dict[str, dict]:
    return {entry["key"]: entry for entry in service.get("envVars", [])}


def _dotenv(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, value = stripped.split("=", 1)
            values[key] = value
    return values


def test_local_examples_resolve_model_artifacts_under_repository_models() -> None:
    for relative_path in (".env.example", "backend/.env.example"):
        values = _dotenv(ROOT / relative_path)
        assert values["SAFEANES_MODEL_ROOT"] == "./models"
        assert values["UC04_MODEL_PATH"].startswith("./models/")
        assert values["UC05_MODEL_PATH"].startswith("./models/")

    assert _dotenv(ROOT / ".env.example")["MODEL_ARTIFACTS_DIR"] == "./models"


def test_render_blueprint_matches_backend_container_paths_and_cache_value() -> None:
    service = _backend_service()
    env = _env_vars(service)
    dockerfile_path = ROOT / service["dockerfilePath"]
    dockerfile = dockerfile_path.read_text(encoding="utf-8")

    assert service["dockerContext"] == "."
    assert env["SAFEANES_MODEL_ROOT"]["value"] == "/models"
    assert "SAFEANES_MODEL_ROOT=/models" in dockerfile
    assert "COPY models /models" in dockerfile
    assert env["SAFEANES_SIGNAL_FILE_CACHE_ENTRIES"]["value"] == "24"


def test_render_blueprint_uses_explicit_backend_host_and_secret_reference() -> None:
    env = _env_vars(_backend_service())

    assert env["SAFEANES_ALLOWED_HOSTS"]["value"] == "safeanes-backend-kfjc.onrender.com"
    inference_token = env["SAFEANES_INFERENCE_SERVICE_TOKEN"]
    assert inference_token.get("sync") is False
    assert "value" not in inference_token


def test_ci_workflow_runs_builds_and_does_not_deploy() -> None:
    workflow_path = ROOT / ".github" / "workflows" / "safeanes-ci.yml"
    assert workflow_path.is_file()
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "pull_request:" in workflow
    assert "push:" in workflow
    assert "node-version: 22" in workflow
    assert "python-version: '3.12'" in workflow or 'python-version: "3.12"' in workflow
    assert "npm ci" in workflow
    assert "npm run build" in workflow
    assert "python -m pytest backend/tests/test_runtime_configuration.py -q" in workflow
    assert "python -m pytest backend/tests/test_api_backend.py -q" in workflow
    assert "test_uc05_ready_status_serves_eligible_fixed_window_contract_output" not in workflow
    assert "docker build -f backend/Dockerfile" in workflow
    assert "docker build -f aws/lambda_inference/Dockerfile" in workflow

    lowered = workflow.lower()
    for forbidden in ("docker push", "aws lambda update-function-code", "vercel deploy", "render deploy"):
        assert forbidden not in lowered


def test_lambda_smoke_script_reads_service_token_from_environment(monkeypatch, capsys) -> None:
    token = "smoke-test-service-token"
    requests = []

    class Response:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

        @staticmethod
        def json() -> dict:
            return {"error": {"code": "PREPARED_TENSORS_REQUIRED"}}

    class Session:
        def get(self, url: str, **kwargs) -> Response:
            requests.append(("GET", url, kwargs))
            return Response(200)

        def post(self, url: str, **kwargs) -> Response:
            requests.append(("POST", url, kwargs))
            return Response(400)

    monkeypatch.setattr(test_lambda_inference.requests, "Session", Session)
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", f" {token} ")
    assert test_lambda_inference._required_service_token() == token

    test_lambda_inference.test_lambda("https://lambda.example", token)

    post_requests = [request for request in requests if request[0] == "POST"]
    assert len(post_requests) == 2
    assert all(request[2]["headers"] == {"Authorization": f"Bearer {token}"} for request in post_requests)
    assert token not in capsys.readouterr().out
    assert token not in Path(test_lambda_inference.__file__).read_text(encoding="utf-8")

    with pytest.raises(RuntimeError, match="SAFEANES_INFERENCE_SERVICE_TOKEN must be set"):
        test_lambda_inference._required_service_token({})
