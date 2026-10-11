from __future__ import annotations

from backend.app.services.signals.uc05_events import derive_spo2_desaturation_events


def _rows(values: list[float | None], interval: float = 2.0) -> list[dict]:
    return [
        {
            "timestamp": index * interval,
            "value": value,
            "quality": "UNKNOWN",
            "unit": "NOT_RECORDED",
            "source": "Solar8000",
            "track_name": "Solar8000/PLETH_SPO2",
            "is_missing": value is None,
            "provenance": {"dataset": "VitalDB", "raw_sha256": "source-sha"},
        }
        for index, value in enumerate(values)
    ]


def test_spo2_task_event_is_derived_only_after_contiguous_task_definition():
    events = derive_spo2_desaturation_events("1", _rows([89.0] * 31), expected_interval_s=2.0)

    assert len(events) == 1
    event = events[0]
    assert event["start_time_s"] == 0
    assert event["end_time_s"] == 60
    assert event["available_at_s"] == 60
    assert event["source_class"] == "DERIVED"
    assert event["definition"] == "SpO2 < 90% for at least 60 seconds"
    assert event["source"] == "Solar8000/PLETH_SPO2"
    assert event["quality"] == "UNKNOWN"
    assert event["provenance"]["raw_sha256"] == "source-sha"


def test_spo2_task_event_does_not_bridge_missing_or_out_of_range_samples():
    rows = _rows([89.0] * 16 + [None] + [89.0] * 16)
    events = derive_spo2_desaturation_events("1", rows, expected_interval_s=2.0)

    assert events == []


def test_spo2_task_event_abstains_when_sampling_cadence_is_unrecorded():
    assert derive_spo2_desaturation_events("1", _rows([89.0] * 40), expected_interval_s=None) == []
