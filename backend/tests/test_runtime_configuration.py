from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings
from backend.app.main import BackendRuntime, create_app


def test_settings_load_external_model_files_and_application_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAFEANES_DATA_ROOT", "./backend/data")
    monkeypatch.setenv("SAFEANES_MODEL_ROOT", "../model")
    monkeypatch.setenv("UC04_MODEL_PATH", "../model/safeanes_uc04_model/model.pt")
    monkeypatch.setenv("UC05_MODEL_PATH", "../model/safeanes_uc05_respformer_v1/respformer.pt")
    monkeypatch.setenv("MODEL_REGISTRY_PATH", "./backend/app/ml/registry/model_registry.json")
    monkeypatch.setenv("SAFEANES_DEVICE", "cpu")
    monkeypatch.setenv("SAFEANES_LOG_LEVEL", "WARNING")
    monkeypatch.setenv("SAFEANES_APP_MODE", "VITALDB_REPLAY")
    monkeypatch.setenv("SAFEANES_ENV", "local")

    settings = Settings.from_env()
    project = Path(__file__).resolve().parents[2]

    assert settings.data_root == (project / "backend/data").resolve()
    assert settings.model_root == (project.parent / "model").resolve()
    assert settings.uc04_model_path == (project.parent / "model/safeanes_uc04_model/model.pt").resolve()
    assert settings.uc05_model_path == (project.parent / "model/safeanes_uc05_respformer_v1/respformer.pt").resolve()
    assert settings.model_registry_path == (project / "backend/app/ml/registry/model_registry.json").resolve()
    assert settings.log_level == "WARNING"
    assert settings.application_mode == "VITALDB_REPLAY"


def test_settings_load_inference_service_token_without_exposing_it(monkeypatch: pytest.MonkeyPatch) -> None:
    token = "private-lambda-service-token"
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", token)

    settings = Settings.from_env()

    assert settings.inference_service_token == token
    assert token not in repr(settings)


def test_remote_inference_requires_service_token_when_offload_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SAFEANES_INFERENCE_SERVICE_TOKEN", raising=False)

    with pytest.raises(ValueError, match="SAFEANES_INFERENCE_SERVICE_TOKEN"):
        Settings(
            data_root=Path("data"),
            model_root=Path("models"),
            inference_url="https://lambda.example",
            offload_inference=True,
        )


def test_production_settings_require_an_access_token() -> None:
    with pytest.raises(ValueError, match="SAFEANES_API_TOKEN"):
        Settings(data_root=Path("data"), model_root=Path("models"), environment="production")


def test_api_token_protects_application_routes_and_echoes_request_id(tmp_path: Path) -> None:
    settings = Settings(
        data_root=tmp_path / "data",
        model_root=tmp_path / "models",
        environment="production",
        api_token="test-only-token-123",
    )
    runtime = BackendRuntime(settings=settings, load_models=False)

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        live = client.get("/api/v1/health/live")
        denied = client.get("/api/v1/models", headers={"X-Request-ID": "safe-test-request-1"})
        allowed = client.get(
            "/api/v1/models",
            headers={"Authorization": "Bearer test-only-token-123", "X-Request-ID": "safe-test-request-2"},
        )

    assert live.status_code == 200
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "UNAUTHORIZED"
    assert denied.headers["X-Request-ID"] == "safe-test-request-1"
    assert allowed.status_code == 200
    assert allowed.headers["X-Request-ID"] == "safe-test-request-2"


def test_invalid_environment_values_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAFEANES_APP_MODE", "MIXED_DATA")
    monkeypatch.setenv("SAFEANES_ENV", "local")

    with pytest.raises(ValueError, match="SAFEANES_APP_MODE"):
        Settings.from_env()


def test_missing_artifacts_are_visible_without_exposing_local_paths(tmp_path: Path) -> None:
    settings = Settings(data_root=tmp_path / "data", model_root=tmp_path / "private-models")
    runtime = BackendRuntime(settings=settings, load_models=True)
    runtime.initialize()

    statuses = runtime.models.statuses()
    rendered = str(statuses)

    assert all(item["readiness_status"] == "BLOCKED" for item in statuses)
    assert all(runtime.models.status(item["model_id"]) == item for item in statuses)
    assert all("MODEL_NOT_READY" in item["blockers"][0] for item in statuses)
    assert str(settings.model_root) not in rendered


def test_backend_build_id_explicit_override(monkeypatch):
    from backend.app.core.build_info import get_backend_build_id
    monkeypatch.setenv("SAFEANES_BUILD_ID", "release-test-17")
    assert get_backend_build_id() == "release-test-17"
    assert Settings.from_env().build_id == "release-test-17"


@pytest.mark.parametrize("invalid", ("", " ", "\t\r\n"))
def test_backend_build_id_rejects_empty_explicit_configuration(monkeypatch, invalid):
    from backend.app.core.build_info import get_backend_build_id
    monkeypatch.setenv("SAFEANES_BUILD_ID", invalid)
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        get_backend_build_id()
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        Settings.from_env()


def test_default_backend_fingerprint_is_cached_and_path_independent(tmp_path, monkeypatch):
    from backend.app.core.build_info import get_backend_build_id, _fingerprint_sources, _default_build_id
    monkeypatch.delenv("SAFEANES_BUILD_ID", raising=False)
    original = get_backend_build_id()
    assert original == get_backend_build_id()
    assert _default_build_id.cache_info().hits >= 1
    roots = [tmp_path / "checkout-one", tmp_path / "checkout-two"]
    for root in roots:
        (root / "nested").mkdir(parents=True)
        (root / "nested" / "module.py").write_bytes(b"value = 1\n")
        (root / "a.py").write_bytes(b"alpha = 2\n")
    assert _fingerprint_sources(roots[0]) == _fingerprint_sources(roots[1])
    (roots[1] / "ignored.json").write_text("non-python payload")
    assert _fingerprint_sources(roots[0]) == _fingerprint_sources(roots[1])
    (roots[1] / "nested" / "module.py").write_bytes(b"value = 3\n")
    assert _fingerprint_sources(roots[0]) != _fingerprint_sources(roots[1])


@pytest.mark.parametrize("invalid", (r"C:\private\model", "/srv/models", "release/id", "release\n17", "release\t17", "release\x0017", "a" * 129, " release-17 "))
def test_backend_build_id_rejects_paths_controls_and_unbounded_ids(monkeypatch, tmp_path, invalid):
    from backend.app.core.build_info import get_backend_build_id
    # Use a minimal mapping to exercise NUL rejection without asking the OS to
    # install an invalid environment string or exposing unrelated env values.
    monkeypatch.setattr("os.environ", {"SAFEANES_BUILD_ID": invalid})
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        get_backend_build_id()
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        Settings.from_env()
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        Settings(data_root=tmp_path, model_root=tmp_path, build_id=invalid)


def test_backend_build_id_supports_bounded_safe_release_names(monkeypatch):
    from backend.app.core.build_info import get_backend_build_id
    for value in ("release-17.2+cpu_debug", "a" * 128):
        monkeypatch.setenv("SAFEANES_BUILD_ID", value)
        assert get_backend_build_id() == value


def test_default_model_root_resolves_to_repository_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SAFEANES_MODEL_ROOT", raising=False)
    monkeypatch.setenv("SAFEANES_ENV", "local")

    settings = Settings.from_env()
    project = Path(__file__).resolve().parents[2]

    assert settings.model_root == (project / "models").resolve()


def test_settings_reject_wildcard_allowed_hosts() -> None:
    with pytest.raises(ValueError, match="SAFEANES_ALLOWED_HOSTS"):
        Settings(
            data_root=Path("data"),
            model_root=Path("models"),
            allowed_hosts=("*",),
        )
