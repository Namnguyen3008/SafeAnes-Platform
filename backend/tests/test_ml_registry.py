from dataclasses import replace
import json
import os
from pathlib import Path

import pytest
import torch

from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.ml.registry.artifacts import (
    ArtifactIntegrityError,
    ArtifactRegistry,
    UnsafeArtifactPathError,
)


MODEL_ROOT = Path(
    os.environ.get("SAFEANES_MODEL_ROOT", Path(__file__).resolve().parents[3] / "model")
).expanduser().resolve()
pytestmark = pytest.mark.skipif(
    not (MODEL_ROOT / "safeanes_uc04_model" / "model.pt").is_file(),
    reason="set SAFEANES_MODEL_ROOT to the directory containing the audited local model artifacts",
)


def test_registry_contracts_pin_the_audited_checkpoint_digests() -> None:
    registry = ArtifactRegistry(model_root=MODEL_ROOT)

    assert registry.resolve_checkpoint(UC04_CONTRACT).name == "model.pt"
    assert registry.resolve_checkpoint(UC05_CONTRACT).name == "respformer.pt"
    assert UC04_CONTRACT.artifact_sha256 == (
        "e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa"
    )


def test_registry_rejects_paths_outside_the_trusted_model_root() -> None:
    registry = ArtifactRegistry(model_root=MODEL_ROOT)
    untrusted = replace(UC04_CONTRACT, artifact_path="../outside/model.pt")

    with pytest.raises(UnsafeArtifactPathError):
        registry.resolve_checkpoint(untrusted)


def test_registry_uses_an_explicit_external_checkpoint_path() -> None:
    checkpoint = (MODEL_ROOT / UC04_CONTRACT.artifact_path).resolve()
    registry = ArtifactRegistry(
        model_root=Path("unused-root"),
        model_paths={UC04_CONTRACT.model_id: checkpoint},
    )

    assert registry.resolve_checkpoint(UC04_CONTRACT) == checkpoint


def test_registry_manifest_cannot_override_compiled_artifact_hash(tmp_path: Path) -> None:
    source = Path(__file__).resolve().parents[1] / "app/ml/registry/model_registry.json"
    document = json.loads(source.read_text(encoding="utf-8"))
    document["models"][UC04_CONTRACT.model_id]["artifact_sha256"] = "0" * 64
    altered = tmp_path / "model_registry.json"
    altered.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ArtifactIntegrityError):
        ArtifactRegistry(model_root=tmp_path, registry_path=altered)


def test_hash_mismatch_is_rejected_before_torch_deserialization(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    checkpoint = tmp_path / "safeanes_uc04_model" / "model.pt"
    checkpoint.parent.mkdir()
    checkpoint.write_bytes(b"not a checkpoint")
    registry = ArtifactRegistry(model_root=tmp_path)
    calls: list[Path] = []

    def forbidden_load(*args: object, **kwargs: object) -> None:
        calls.append(Path(str(args[0])))
        raise AssertionError("deserializer must not run before digest verification")

    monkeypatch.setattr(torch, "load", forbidden_load)
    with pytest.raises(ArtifactIntegrityError):
        registry.load_state_dict(UC04_CONTRACT, device="cpu")

    assert calls == []


def test_audited_checkpoint_deserializes_as_a_weights_only_state_dict() -> None:
    registry = ArtifactRegistry(model_root=MODEL_ROOT)

    state = registry.load_state_dict(UC04_CONTRACT, device="cpu")

    assert isinstance(state, dict)
    assert all(isinstance(key, str) and isinstance(value, torch.Tensor) for key, value in state.items())
    assert "num_center" in state
