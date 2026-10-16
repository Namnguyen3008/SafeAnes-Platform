from __future__ import annotations

from dataclasses import dataclass, field
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from backend.app.core.build_info import get_backend_build_id, validate_build_id

def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _configured_path(raw: str | None, *, root: Path, default: Path) -> Path:
    if not raw:
        return default.resolve()
    value = Path(raw).expanduser()
    return (value if value.is_absolute() else root / value).resolve()


def _parse_origins(raw: str | None) -> tuple[str, ...]:
    values = tuple(dict.fromkeys(item.strip().rstrip("/") for item in (raw or "").split(",") if item.strip()))
    for origin in values:
        parsed = urlsplit(origin)
        if (
            origin == "*"
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("SAFEANES_CORS_ORIGINS must contain explicit http(s) origins; '*' is not allowed")
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("SAFEANES_CORS_ORIGINS contains an invalid port") from exc
        if parsed.path or parsed.query or parsed.fragment:
            raise ValueError("CORS entries must be origins without paths, queries, or fragments")
    return values


def _parse_hosts(raw: str | None) -> tuple[str, ...]:
    hosts = tuple(dict.fromkeys(item.strip().lower() for item in (raw or "").split(",") if item.strip()))
    if not hosts:
        return ("localhost", "127.0.0.1", "testserver", "backend")
    for host in hosts:
        if host == "*" or not re.fullmatch(r"[a-z0-9.-]+(?::[0-9]{1,5})?", host):
            raise ValueError("SAFEANES_ALLOWED_HOSTS must contain explicit host names")
    return hosts


@dataclass(frozen=True)
class Settings:
    data_root: Path
    model_root: Path
    cors_origins: tuple[str, ...] = ()
    model_device: str = "cpu"
    environment: str = "local"
    application_mode: str = "VITALDB_REPLAY"
    log_level: str = "INFO"
    api_token: str | None = field(default=None, repr=False)
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "testserver", "backend")
    uc04_model_path: Path | None = None
    uc05_model_path: Path | None = None
    model_registry_path: Path | None = None
    max_signal_range_seconds: float = 3600.0
    max_waveform_range_seconds: float = 120.0
    max_samples_per_response: int = 200_000
    # Replay frames touch both UC04/UC05 numeric tracks and waveform sources.
    # Retaining a tightly bounded working set avoids reopening VitalDB tracks
    # while strictly enforcing cloud container memory limits (512MB).
    signal_file_cache_entries: int = 6
    model_series_cache_entries: int = 2
    prediction_cache_entries: int = 2
    build_id: str = field(default_factory=get_backend_build_id)

    def __post_init__(self) -> None:
        object.__setattr__(self, "build_id", validate_build_id(self.build_id))
        object.__setattr__(self, "data_root", Path(self.data_root).expanduser().resolve())
        object.__setattr__(self, "model_root", Path(self.model_root).expanduser().resolve())
        object.__setattr__(self, "cors_origins", tuple(self.cors_origins))
        object.__setattr__(self, "allowed_hosts", tuple(self.allowed_hosts))
        if self.uc04_model_path is not None:
            object.__setattr__(self, "uc04_model_path", Path(self.uc04_model_path).expanduser().resolve())
        if self.uc05_model_path is not None:
            object.__setattr__(self, "uc05_model_path", Path(self.uc05_model_path).expanduser().resolve())
        registry_path = self.model_registry_path or (_project_root() / "backend/app/ml/registry/model_registry.json")
        object.__setattr__(self, "model_registry_path", Path(registry_path).expanduser().resolve())
        if self.model_device not in {"cpu", "cuda"}:
            raise ValueError("SAFEANES_DEVICE must be 'cpu' or 'cuda'")
        if self.environment not in {"local", "test", "production"}:
            raise ValueError("SAFEANES_ENV must be local, test, or production")
        if self.application_mode not in {"VITALDB_REPLAY", "SYNTHETIC_DEMO"}:
            raise ValueError("SAFEANES_APP_MODE must be VITALDB_REPLAY or SYNTHETIC_DEMO")
        if self.log_level.upper() not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("SAFEANES_LOG_LEVEL must be a standard logging level")
        object.__setattr__(self, "log_level", self.log_level.upper())
        if self.api_token and (not self.api_token.isascii() or any(char.isspace() for char in self.api_token)):
            raise ValueError("SAFEANES_API_TOKEN must contain ASCII non-whitespace characters only")
        if self.environment == "production" and (not self.api_token or len(self.api_token) < 16):
            raise ValueError("SAFEANES_API_TOKEN must be set to at least 16 characters in production")
        _parse_hosts(",".join(self.allowed_hosts))
        if (
            not math.isfinite(self.max_signal_range_seconds)
            or not math.isfinite(self.max_waveform_range_seconds)
            or self.max_signal_range_seconds <= 0
            or self.max_waveform_range_seconds <= 0
        ):
            raise ValueError("signal time-range limits must be positive")
        if self.max_samples_per_response < 1:
            raise ValueError("SAFEANES_MAX_SAMPLES must be positive")
        if self.signal_file_cache_entries < 1 or self.model_series_cache_entries < 1 or self.prediction_cache_entries < 1:
            raise ValueError("cache entry limits must be positive")
        _parse_origins(",".join(self.cors_origins))

    @property
    def catalog_path(self) -> Path:
        return self.data_root / "manifests" / "vitaldb_case_catalog.json"

    @property
    def vitaldb_root(self) -> Path:
        return self.data_root / "vitaldb"

    @classmethod
    def from_env(cls) -> "Settings":
        root = _project_root()
        return cls(
            build_id=get_backend_build_id(),
            data_root=_configured_path(os.getenv("SAFEANES_DATA_ROOT"), root=root, default=root / "backend" / "data"),
            model_root=_configured_path(os.getenv("SAFEANES_MODEL_ROOT"), root=root, default=root / "models"),
            cors_origins=_parse_origins(os.getenv("SAFEANES_CORS_ORIGINS")),
            model_device=os.getenv("SAFEANES_RUNTIME_DEVICE", os.getenv("SAFEANES_DEVICE", "cpu")).strip().lower(),
            environment=os.getenv("SAFEANES_ENV", "local").strip().lower(),
            application_mode=os.getenv("SAFEANES_APP_MODE", "VITALDB_REPLAY").strip().upper(),
            log_level=os.getenv("SAFEANES_LOG_LEVEL", "INFO").strip().upper(),
            api_token=os.getenv("SAFEANES_API_TOKEN") or None,
            allowed_hosts=_parse_hosts(os.getenv("SAFEANES_ALLOWED_HOSTS")),
            uc04_model_path=(
                _configured_path(os.getenv("UC04_MODEL_PATH"), root=root, default=root / "models/uc04/model.pt")
                if os.getenv("UC04_MODEL_PATH") else None
            ),
            uc05_model_path=(
                _configured_path(os.getenv("UC05_MODEL_PATH"), root=root, default=root / "models/uc05/model.pt")
                if os.getenv("UC05_MODEL_PATH") else None
            ),
            model_registry_path=_configured_path(
                os.getenv("MODEL_REGISTRY_PATH"),
                root=root,
                default=root / "backend/app/ml/registry/model_registry.json",
            ),
            max_signal_range_seconds=float(os.getenv("SAFEANES_MAX_SIGNAL_RANGE_SECONDS", "3600")),
            max_waveform_range_seconds=float(os.getenv("SAFEANES_MAX_WAVEFORM_RANGE_SECONDS", "120")),
            max_samples_per_response=int(os.getenv("SAFEANES_MAX_SAMPLES", "200000")),
            signal_file_cache_entries=int(os.getenv("SAFEANES_SIGNAL_FILE_CACHE_ENTRIES", "24")),
            model_series_cache_entries=int(os.getenv("SAFEANES_MODEL_SERIES_CACHE_ENTRIES", "2")),
            prediction_cache_entries=int(os.getenv("SAFEANES_PREDICTION_CACHE_ENTRIES", "2")),
        )
