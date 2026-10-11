from __future__ import annotations

from pathlib import Path

import torch

from backend.app.ml.registry.artifacts import ArtifactRegistry


class ModelNotLoadedError(RuntimeError):
    """Inference was requested before the checked checkpoint was loaded."""


class ModelLoadError(RuntimeError):
    """A model architecture, configuration, or state dict failed validation."""


class InferenceExecutionError(RuntimeError):
    """The model forward pass produced an invalid result or failed."""


class ModelReadinessError(RuntimeError):
    """The model is loaded but its verified contract does not permit inference."""


class BaseInferenceService:
    def __init__(
        self,
        *,
        model_root: str | Path | None = None,
        model_path: str | Path | None = None,
        model_registry_path: str | Path | None = None,
        device: str | torch.device = "cpu",
    ) -> None:
        self.registry = ArtifactRegistry(
            Path(model_root) if model_root is not None else None,
            model_paths={self.contract.model_id: Path(model_path)} if model_path is not None else None,
            registry_path=Path(model_registry_path) if model_registry_path is not None else None,
        )
        self.device = torch.device(device)
        if self.device.type == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA was requested but is unavailable in this runtime")
        if self.device.type not in {"cpu", "cuda"}:
            raise ValueError(f"unsupported inference device: {self.device.type}")
        self.model: torch.nn.Module | None = None

    def _require_model(self) -> torch.nn.Module:
        if self.model is None:
            raise ModelNotLoadedError("call load_model() before inference")
        return self.model
