from __future__ import annotations

import math
from typing import Any


def derive_spo2_desaturation_events(
    case_id: str | int,
    observations: list[dict[str, Any]],
    *,
    expected_interval_s: float | None,
    threshold_percent: float = 90.0,
    minimum_duration_s: float = 60.0,
) -> list[dict[str, Any]]:
    """Derive task-definition candidates without bridging missing or invalid samples."""
    if expected_interval_s is None or not math.isfinite(expected_interval_s) or expected_interval_s <= 0:
        return []
    if not math.isfinite(threshold_percent) or not math.isfinite(minimum_duration_s) or minimum_duration_s <= 0:
        raise ValueError("desaturation definition must use finite positive values")
    rows = sorted(observations, key=lambda row: float(row.get("timestamp", -1)))
    events: list[dict[str, Any]] = []
    run: list[dict[str, Any]] = []

    def finish() -> None:
        if len(run) < 2:
            return
        start = float(run[0]["timestamp"])
        end = float(run[-1]["timestamp"])
        if end - start + 1e-6 < minimum_duration_s:
            return
        source = str(run[0].get("track_name") or "Solar8000/PLETH_SPO2")
        provenance = run[0].get("provenance") or {}
        events.append({
            "id": f"vdb-spo2-under-90-{case_id}-{start:.3f}",
            "case_id": str(case_id),
            "start_time_s": start,
            "end_time_s": end,
            "timestamp": start,
            "available_at_s": end,
            "event_type": "SPO2_BELOW_90_CANDIDATE",
            "description": "SpO2 below 90% for at least 60 seconds (derived from recorded samples)",
            "definition": "SpO2 < 90% for at least 60 seconds",
            "source_class": "DERIVED",
            "source": source,
            "quality": "UNKNOWN",
            "provenance": provenance,
        })

    previous_time: float | None = None
    for row in rows:
        try:
            timestamp = float(row["timestamp"])
            value = row.get("value")
            valid_value = value is not None and math.isfinite(float(value)) and 0 <= float(value) <= 100
            usable = not bool(row.get("is_missing", False)) and valid_value and float(value) < threshold_percent
        except (KeyError, TypeError, ValueError, OverflowError):
            usable = False
            timestamp = math.nan
        cadence_ok = (previous_time is None or math.isfinite(timestamp) and
                      abs((timestamp - previous_time) - expected_interval_s) <= max(0.05, expected_interval_s * 0.05))
        if not usable or not cadence_ok:
            finish()
            run.clear()
        if usable and math.isfinite(timestamp):
            run.append(row)
            previous_time = timestamp
        else:
            previous_time = timestamp if math.isfinite(timestamp) else None
    finish()
    return events
