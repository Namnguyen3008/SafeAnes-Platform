from pathlib import Path

import yaml

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
