from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import torch

from backend.app.ml.contracts.model_contract import ModelContract
from backend.app.ml.registry.contracts import MODEL_CONTRACTS


class ArtifactError(RuntimeError):
    """Base error for local model artifact failures."""


class UnsafeArtifactPathError(ArtifactError):
    """An artifact path was not a member of the fixed local registry."""


class ArtifactIntegrityError(ArtifactError):
    """A local artifact's bytes did not match its audited SHA-256."""


class UnsupportedArtifactError(ArtifactError):
    """An artifact is not the expected state-dict or JSON format."""


def default_model_root() -> Path:
    """Return the repository-local external-artifact mount point."""
    return Path(__file__).resolve().parents[4] / "models"


class ArtifactRegistry:
    """Loads only audited, allowlisted files rooted in a trusted local folder."""

    def __init__(
        self,
        model_root: Path | None = None,
        *,
        model_paths: dict[str, Path | str | None] | None = None,
        registry_path: Path | str | None = None,
    ) -> None:
        self.model_root = (model_root or default_model_root()).expanduser().resolve()
        self.model_paths = {
            model_id: Path(path).expanduser().resolve()
            for model_id, path in (model_paths or {}).items()
            if path is not None
        }
        self.registry_path = Path(registry_path or Path(__file__).with_name("model_registry.json")).expanduser().resolve()
        self._registry = self._load_registry()

    def _load_registry(self) -> dict[str, Any]:
        try:
            document = json.loads(self.registry_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ArtifactError("configured model registry is missing or invalid") from exc
        if not isinstance(document, dict) or document.get("schema_version") != "1.0":
            raise UnsupportedArtifactError("model registry schema version is unsupported")
        models = document.get("models")
        if not isinstance(models, dict) or set(models) != set(MODEL_CONTRACTS):
            raise UnsupportedArtifactError("model registry must contain the complete audited model allowlist")
        for model_id, contract in MODEL_CONTRACTS.items():
            entry = models.get(model_id)
            if (
                not isinstance(entry, dict)
                or entry.get("artifact_path") != contract.artifact_path
                or entry.get("artifact_sha256", "").casefold() != contract.artifact_sha256.casefold()
                or entry.get("supporting_artifacts") != contract.supporting_artifacts
            ):
                raise ArtifactIntegrityError("model registry differs from the compiled audited model contracts")
        return document

    def _assert_registered_contract(self, contract: ModelContract) -> None:
        registered = MODEL_CONTRACTS.get(contract.model_id)
        if registered is None:
            raise UnsafeArtifactPathError(
                f"model_id is not in the local allowlist: {contract.model_id}"
            )
        if (
            registered.artifact_path != contract.artifact_path
            or registered.artifact_sha256 != contract.artifact_sha256
        ):
            raise UnsafeArtifactPathError(
                "contract artifact path or digest differs from the registry"
            )
        manifest_entry = self._registry["models"].get(contract.model_id, {})
        if manifest_entry.get("artifact_sha256", "").casefold() != contract.artifact_sha256.casefold():
            raise UnsafeArtifactPathError("contract digest differs from the configured local registry")

    def resolve_path(self, relative_path: str) -> Path:
        candidate = Path(relative_path)
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
            raise UnsafeArtifactPathError("artifact path must be a safe relative path")
        root = self.model_root
        resolved = (root / candidate).resolve()
        try:
            resolved.relative_to(root)
        except ValueError as exc:
            raise UnsafeArtifactPathError(
                "artifact path resolves outside the trusted model root"
            ) from exc
        return resolved

    @staticmethod
    def sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _verified_path(self, relative_path: str, expected_sha256: str) -> Path:
        path = self.resolve_path(relative_path)
        if not path.is_file():
            raise ArtifactError(f"required local artifact is missing: {path}")
        actual = self.sha256(path)
        if actual.lower() != expected_sha256.lower():
            raise ArtifactIntegrityError(
                f"SHA-256 mismatch for {relative_path}: expected "
                f"{expected_sha256}, got {actual}"
            )
        return path

    def _checkpoint_path(self, contract: ModelContract) -> Path:
        override = self.model_paths.get(contract.model_id)
        if override is not None:
            return override
        return self.resolve_path(contract.artifact_path)

    def resolve_checkpoint(self, contract: ModelContract) -> Path:
        self._assert_registered_contract(contract)
        path = self._checkpoint_path(contract)
        return self._verify_absolute_path(path, contract.artifact_sha256, contract.artifact_path)

    def _verify_absolute_path(self, path: Path, expected_sha256: str, display_name: str) -> Path:
        if not path.is_file():
            raise ArtifactError(f"required local artifact is missing: {display_name}")
        actual = self.sha256(path)
        if actual.lower() != expected_sha256.lower():
            raise ArtifactIntegrityError(
                f"SHA-256 mismatch for {display_name}: expected {expected_sha256}, got {actual}"
            )
        return path

    def load_state_dict(
        self, contract: ModelContract, device: str | torch.device = "cpu"
    ) -> dict[str, torch.Tensor]:
        path = self.resolve_checkpoint(contract)
        # The exact registry entry and digest are checked before deserialization.
        value: Any = torch.load(
            path, map_location=device, weights_only=True
        )
        if not isinstance(value, dict) or not value:
            raise UnsupportedArtifactError(
                "checkpoint must contain a non-empty state_dict"
            )
        if not all(
            isinstance(key, str) and isinstance(tensor, torch.Tensor)
            for key, tensor in value.items()
        ):
            raise UnsupportedArtifactError(
                "checkpoint contains non-tensor or non-string state_dict entries"
            )
        return value

    def load_supporting_json(
        self, contract: ModelContract, artifact_name: str
    ) -> dict[str, Any]:
        self._assert_registered_contract(contract)
        expected_sha256 = contract.supporting_artifacts.get(artifact_name)
        if expected_sha256 is None:
            raise UnsafeArtifactPathError(
                f"supporting artifact is not allowlisted: {artifact_name}"
            )
        if Path(artifact_name).name != artifact_name:
            raise UnsafeArtifactPathError("supporting artifact name must be a file name")
        path = self._checkpoint_path(contract).parent / artifact_name
        path = self._verify_absolute_path(path, expected_sha256, artifact_name)
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise UnsupportedArtifactError(
                f"supporting artifact is not valid UTF-8 JSON: {artifact_name}"
            ) from exc
        if not isinstance(value, dict):
            raise UnsupportedArtifactError(
                f"supporting JSON root must be an object: {artifact_name}"
            )
        return value
