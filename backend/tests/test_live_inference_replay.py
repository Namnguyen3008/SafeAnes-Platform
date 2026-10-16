from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from backend.app.core.config import Settings
from backend.app.main import BackendRuntime
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.services.inference.inference_worker import LiveInferenceWorker
from backend.app.services.replay.replay_scheduler import ReplayInferenceScheduler
from backend.app.services.replay.window_loader import WindowLoader


def test_window_loader_and_live_inference_worker(tmp_path: Path):
    settings = Settings.from_env()
    runtime = BackendRuntime(settings=settings, load_models=True)
    runtime.initialize()
    try:
        loader = WindowLoader(runtime.vitaldb, runtime.models.preprocessor)
        # Test case 1 at 7200s (window [6600, 7200])
        result = loader.get_window("1", UC05_CONTRACT.model_id, 7200.0)
        assert result is not None
        window, prepared, report = result
        assert window.prediction_time_s == 7200.0
        assert report["input_eligible"] is True

        worker = LiveInferenceWorker(runtime.models, loader)
        res = worker.execute_sync(
            session_id="test-session",
            generation=1,
            case_id="1",
            model_id=UC05_CONTRACT.model_id,
            prediction_time_s=7200.0,
        )
        assert res is not None
        assert res.session_id == "test-session"
        assert res.generation == 1
        assert res.latency_ms > 0
        assert len(res.predictions) > 0
        worker.close()
    finally:
        runtime.close()


def test_replay_inference_scheduler_adaptive_stride():
    assert ReplayInferenceScheduler.adaptive_stride(1) == 10.0
    assert ReplayInferenceScheduler.adaptive_stride(2) == 10.0
    assert ReplayInferenceScheduler.adaptive_stride(5) == 15.0
    assert ReplayInferenceScheduler.adaptive_stride(10) == 30.0
    assert ReplayInferenceScheduler.adaptive_stride(60) == 60.0


def test_supabase_vitaldb_repository():
    from backend.app.repositories.supabase_vitaldb_repository import SupabaseVitalDBRepository
    repo = SupabaseVitalDBRepository()
    connected = repo.is_connected()
    assert connected is True
    cases = repo.list_cases()
    assert isinstance(cases, list)
    assert len(cases) > 0
