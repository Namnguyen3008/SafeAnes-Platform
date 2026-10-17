from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import ingest_vitaldb_to_supabase as ingest


def test_dry_run_needs_no_write_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert ingest.get_http_client(dry_run=True) is None


def test_live_ingest_requires_service_role_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://safeanes.example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY"):
        ingest.get_http_client()


def test_ingest_never_falls_back_to_anon_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://safeanes.example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key")

    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY"):
        ingest.get_http_client()


def test_ingest_client_uses_service_key_only_in_headers(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    service_key = "server-only-service-key"
    monkeypatch.setenv("SUPABASE_URL", "https://safeanes.example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", service_key)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key")

    client = ingest.get_http_client()

    assert client is not None
    try:
        assert client.headers["apikey"] == service_key
        assert client.headers["Authorization"] == f"Bearer {service_key}"
        assert service_key not in str(client.base_url)
        assert "public-anon-key" not in str(client.headers)
        assert service_key not in caplog.text
    finally:
        client.close()


class _FakeResponse:
    status_code = 201
    text = ""


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def post(self, url: str, *, json: object, params: dict[str, str]) -> _FakeResponse:
        self.calls.append({"url": url, "json": json, "params": params})
        return _FakeResponse()


class _Series(list[float]):
    def replace(self, _mapping: dict[object, object]) -> _Series:
        return self

    def tolist(self) -> list[float]:
        return list(self)


class _Frame:
    iloc: _Frame

    def __init__(self) -> None:
        self.iloc = self

    def __len__(self) -> int:
        return 1

    def __getitem__(self, key: object) -> _Frame | _Series:
        if isinstance(key, slice):
            return self
        return _Series([70.0])


def test_postgrest_writes_upsert_by_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://safeanes.example.supabase.co")
    client = _FakeClient()
    track = SimpleNamespace(unit="bpm", srate=1.0, type=1)
    event_track = SimpleNamespace(recs=[{"dt": 1.0, "val": "induction"}])

    case_file = SimpleNamespace(dtstart=0.0, dtend=1.0, trks={"Solar8000/HR": track})
    track_file = SimpleNamespace(dtstart=0.0, dtend=1.0, trks={"Solar8000/HR": track})
    event_file = SimpleNamespace(dtstart=0.0, trks={"EVENT": event_track})
    window_file = SimpleNamespace(
        dtstart=0.0,
        dtend=1.0,
        trks={"Solar8000/HR": track},
        to_pandas=lambda _tracks, interval: _Frame(),
    )

    ingest.upsert_case(client, "17", case_file, {})
    ingest.upsert_tracks(client, "17", track_file)
    ingest.upsert_events(client, "17", event_file)
    ingest.upsert_signal_windows(client, "17", window_file)

    assert [call["url"].rsplit("/", 1)[-1] for call in client.calls] == [
        "safeanes_cases",
        "safeanes_tracks",
        "safeanes_events",
        "safeanes_signal_windows",
    ]
    assert all(call["params"] == {"on_conflict": "id"} for call in client.calls)
    expected_payload_fields = [
        {"id", "dataset_id", "subject_id", "age", "sex", "height", "weight", "bmi", "asa", "op_name", "department", "duration_s", "track_count", "has_waveforms", "review_status", "metadata"},
        {"id", "case_id", "signal_code", "signal_name", "device", "sample_rate_hz", "unit", "duration_s", "metadata"},
        {"id", "case_id", "timestamp_s", "event_type", "name", "value", "unit", "source_system", "provenance_ref"},
        {"id", "case_id", "window_start_s", "window_end_s", "observations", "waveforms", "predictions_uc04", "predictions_uc05"},
    ]
    for call, required_fields in zip(client.calls, expected_payload_fields, strict=True):
        payload = call["json"]
        assert isinstance(payload, list) and payload
        assert required_fields <= set(payload[0])

    case_metadata = client.calls[0]["json"][0]["metadata"]
    assert isinstance(case_metadata, dict)
    assert {"cache_status", "available_signals", "eligibility", "quality_summary", "valid_windows", "number_of_valid_windows"} <= set(case_metadata)


def test_supabase_ci_resets_and_tests_local_only() -> None:
    repository_root = Path(__file__).resolve().parents[2]
    workflow_path = repository_root / ".github" / "workflows" / "supabase-db.yml"

    assert workflow_path.is_file(), "Supabase local database workflow is missing"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "supabase/setup-cli@v1" in workflow
    assert "supabase start" in workflow
    assert "supabase db reset --local" in workflow
    assert "supabase test db supabase/tests/database/safeanes_vitaldb.test.sql --local" in workflow
    assert "supabase db lint --local --level error" in workflow
    assert "--linked" not in workflow
    assert "--db-url" not in workflow
    assert "SUPABASE_SERVICE_ROLE_KEY" not in workflow
    assert "${{ secrets." not in workflow
