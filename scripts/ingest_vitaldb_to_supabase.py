#!/usr/bin/env python3
"""
SafeAnes VitalDB -> Supabase Ingestion & Synchronization Pipeline.
Downloads official VitalDB cases (.vital binaries), parses physiological tracks,
clinical annotations, and downsampled waveform observation windows,
and upserts them directly into Supabase PostgreSQL.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
from pathlib import Path
import sys
import time
from typing import Any

import httpx
import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("safeanes.ingest_vitaldb")

VITALDB_API = "https://api.vitaldb.net"
DEFAULT_CASES = ["1", "6388", "3300", "210", "452", "3091", "3515"]


def _get_supabase_url() -> str:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is required for live VitalDB ingestion")
    return supabase_url.rstrip("/")


def get_http_client(*, dry_run: bool = False) -> httpx.Client | None:
    if dry_run:
        return None

    supabase_url = _get_supabase_url()
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for live VitalDB ingestion")

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    return httpx.Client(base_url=supabase_url, headers=headers, timeout=60.0)


def _postgrest_upsert(
    client: httpx.Client | None, table_name: str, records: list[dict[str, Any]]
) -> httpx.Response:
    if client is None:
        raise RuntimeError("Supabase client is unavailable for a live VitalDB upsert")
    return client.post(
        f"{_get_supabase_url()}/rest/v1/{table_name}",
        json=records,
        params={"on_conflict": "id"},
    )


def ensure_vital_downloaded(case_id: str, raw_dir: Path) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / f"{case_id}.vital"
    if target.is_file() and target.stat().st_size > 1024:
        logger.info(f"Using locally cached VitalDB file: {target} ({target.stat().st_size / 1024 / 1024:.1f} MB)")
        return target

    url = f"{VITALDB_API}/{case_id}.vital"
    logger.info(f"Downloading VitalDB case {case_id} from {url}...")
    temp_target = raw_dir / f"{case_id}.vital.downloading"
    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as response:
        response.raise_for_status()
        with open(temp_target, "wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
    temp_target.replace(target)
    logger.info(f"Downloaded VitalDB case {case_id}: {target.stat().st_size / 1024 / 1024:.1f} MB")
    return target


def load_manifest(case_id: str, project_root: Path) -> dict[str, Any]:
    manifest_path = project_root / "backend" / "data" / "vitaldb" / "manifests" / f"{case_id}.json"
    if manifest_path.is_file():
        try:
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"Failed to read manifest {manifest_path}: {exc}")
    return {}


def upsert_case(client: httpx.Client | None, case_id: str, vf: Any, manifest: dict[str, Any], dry_run: bool = False):
    p_context = manifest.get("patient_context", {})
    duration_s = float(vf.dtend - vf.dtstart)
    signals = list(vf.trks.keys())

    op_name = manifest.get("recording", {}).get("op_name") or f"General Surgery (Case {case_id})"
    department = manifest.get("recording", {}).get("department") or "Anesthesiology"

    metadata = {
        "cache_status": "READY",
        "available_signals": signals,
        "eligibility": manifest.get("eligibility", {"uc04_eligible": True, "uc05_eligible": True}),
        "quality_summary": manifest.get("quality_summary", {}),
        "valid_windows": manifest.get("valid_windows", {}),
        "number_of_valid_windows": manifest.get("number_of_valid_windows", {}),
    }

    raw_age = p_context.get("age")
    raw_asa = p_context.get("asa")
    raw_h = p_context.get("height")
    raw_w = p_context.get("weight")
    raw_bmi = p_context.get("bmi")

    age = int(float(raw_age)) if raw_age is not None else None
    asa = int(float(raw_asa)) if raw_asa is not None else None
    height = float(raw_h) if raw_h is not None else None
    weight = float(raw_w) if raw_w is not None else None
    bmi = float(raw_bmi) if raw_bmi is not None else None

    # Upsert both "1" and "case_vitaldb_1" for seamless compatibility
    records = [
        {
            "id": case_id,
            "dataset_id": "vitaldb",
            "subject_id": str(p_context.get("subject_id", case_id)),
            "age": age,
            "sex": p_context.get("sex"),
            "height": height,
            "weight": weight,
            "bmi": bmi,
            "asa": asa,
            "op_name": op_name,
            "department": department,
            "duration_s": round(duration_s, 2),
            "track_count": len(signals),
            "has_waveforms": any("WAV" in s or "ART" in s or "CO2" in s for s in signals),
            "review_status": "NOT_REVIEWED",
            "metadata": metadata,
        },
        {
            "id": f"case_vitaldb_{case_id}",
            "dataset_id": "vitaldb",
            "subject_id": str(p_context.get("subject_id", case_id)),
            "age": age,
            "sex": p_context.get("sex"),
            "height": height,
            "weight": weight,
            "bmi": bmi,
            "asa": asa,
            "op_name": op_name,
            "department": department,
            "duration_s": round(duration_s, 2),
            "track_count": len(signals),
            "has_waveforms": any("WAV" in s or "ART" in s or "CO2" in s for s in signals),
            "review_status": "NOT_REVIEWED",
            "metadata": metadata,
        },
    ]

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert cases: {[r['id'] for r in records]}")
        return

    resp = _postgrest_upsert(client, "safeanes_cases", records)
    if resp.status_code not in (200, 201):
        logger.error("Failed to upsert safeanes_cases: HTTP %s", resp.status_code)
    else:
        logger.info(f"Upserted case {case_id} & case_vitaldb_{case_id} into safeanes_cases")


def upsert_tracks(client: httpx.Client | None, case_id: str, vf: Any, dry_run: bool = False):
    records = []
    duration_s = float(vf.dtend - vf.dtstart)

    for name, trk in vf.trks.items():
        if name == "EVENT":
            continue

        device, _, sig = name.partition("/")
        signal_code = sig or device
        unit = getattr(trk, "unit", "") or ""
        rate = getattr(trk, "srate", 1.0) or 1.0

        records.append({
            "id": f"track_{case_id}_{name.replace('/', '_')}",
            "case_id": case_id,
            "signal_code": signal_code,
            "signal_name": name,
            "device": device,
            "sample_rate_hz": float(rate),
            "unit": unit,
            "duration_s": round(duration_s, 2),
            "metadata": {"source": "VitalDB", "track_type": getattr(trk, "type", 1)},
        })

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert {len(records)} tracks for case {case_id}")
        return

    batch_size = 50
    for i in range(0, len(records), batch_size):
        chunk = records[i : i + batch_size]
        resp = _postgrest_upsert(client, "safeanes_tracks", chunk)
        if resp.status_code not in (200, 201):
            logger.error("Failed to upsert tracks batch %s: HTTP %s", i, resp.status_code)
    logger.info(f"Upserted {len(records)} tracks for case {case_id}")


def upsert_events(client: httpx.Client | None, case_id: str, vf: Any, dry_run: bool = False):
    event_trk = vf.trks.get("EVENT")
    if not event_trk or not hasattr(event_trk, "recs") or not event_trk.recs:
        logger.info(f"No EVENT track for case {case_id}")
        return

    origin = float(vf.dtstart)
    records = []
    for idx, rec in enumerate(event_trk.recs):
        dt = float(rec.get("dt", origin))
        val = str(rec.get("val", ""))
        rel_time = max(0.0, dt - origin)

        records.append({
            "id": f"vitaldb_event_{case_id}_{idx}",
            "case_id": case_id,
            "timestamp_s": round(rel_time, 2),
            "event_type": "VITALDB_ANNOTATION",
            "name": val,
            "value": val,
            "unit": "",
            "source_system": "VitalDB EVENT",
            "provenance_ref": f"VitalDB/{case_id}/EVENT/{idx}",
        })

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert {len(records)} events for case {case_id}")
        return

    resp = _postgrest_upsert(client, "safeanes_events", records)
    if resp.status_code not in (200, 201):
        logger.error("Failed to upsert events: HTTP %s", resp.status_code)
    else:
        logger.info(f"Upserted {len(records)} events for case {case_id}")


def upsert_signal_windows(client: httpx.Client | None, case_id: str, vf: Any, dry_run: bool = False):
    """
    Extracts key hemodynamic and respiratory signals at 1-second intervals
    and generates 30-minute window chunks in safeanes_signal_windows.
    """
    # Key tracks to extract for UC04 & UC05
    candidate_tracks = [
        "Solar8000/ART_MBP",
        "Solar8000/ART_SBP",
        "Solar8000/ART_DBP",
        "Solar8000/HR",
        "Solar8000/PLETH_SPO2",
        "Primus/CO2",
        "Primus/ETCO2",
        "Solar8000/RR_CO2",
        "Primus/AWP",
    ]
    present_tracks = [t for t in candidate_tracks if t in vf.trks]
    if not present_tracks:
        logger.warning(f"No priority signals found for case {case_id}")
        return

    logger.info(f"Extracting 1s series for tracks: {present_tracks}...")
    try:
        df = vf.to_pandas(present_tracks, interval=1)
    except Exception as exc:
        logger.error(f"to_pandas failed for case {case_id}: {exc}")
        return

    total_seconds = len(df)
    window_length = 1800  # 30 minutes
    num_windows = math.ceil(total_seconds / window_length)

    window_records = []
    for w_idx in range(num_windows):
        start_s = w_idx * window_length
        end_s = min(total_seconds, (w_idx + 1) * window_length)
        chunk_df = df.iloc[start_s:end_s]

        # Compact observation series
        observations = []
        for t_name in present_tracks:
            series = chunk_df[t_name].replace({np.nan: None}).tolist()
            # Downsample to save space if needed (e.g. 5-second interval for 30m window = 360 points)
            sampled = [{"t": start_s + i * 5, "v": round(series[i * 5], 1)} for i in range(len(series) // 5) if series[i * 5] is not None]
            if sampled:
                observations.append({
                    "track_name": t_name,
                    "count": len(sampled),
                    "samples": sampled,
                })

        # Small 20s waveform sample chunk for preview
        waveforms = {}
        if "Primus/CO2" in present_tracks:
            co2_vals = chunk_df["Primus/CO2"].dropna().head(60).tolist()
            waveforms["capno_preview"] = [round(x, 2) for x in co2_vals]

        window_records.append({
            "id": f"{case_id}_w_{start_s}",
            "case_id": case_id,
            "window_start_s": start_s,
            "window_end_s": end_s,
            "observations": observations,
            "waveforms": waveforms,
            "predictions_uc04": [],
            "predictions_uc05": [],
        })

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert {len(window_records)} signal windows for case {case_id}")
        return

    for r in window_records:
        resp = _postgrest_upsert(client, "safeanes_signal_windows", [r])
        if resp.status_code not in (200, 201):
            logger.error("Failed to upsert signal window %s: HTTP %s", r["id"], resp.status_code)
    logger.info(f"Upserted {len(window_records)} signal windows for case {case_id}")


def main():
    parser = argparse.ArgumentParser(description="Ingest VitalDB datasets into Supabase PostgreSQL")
    parser.add_argument("--cases", default=",".join(DEFAULT_CASES), help="Comma-separated case IDs")
    parser.add_argument("--dry-run", action="store_true", help="Inspect and parse without database writes")
    parser.add_argument("--raw-dir", default=str(PROJECT_ROOT / "backend" / "data" / "vitaldb" / "raw"), help="Path to raw .vital files")
    args = parser.parse_args()

    import vitaldb

    case_ids = [c.strip() for c in args.cases.split(",") if c.strip()]
    raw_dir = Path(args.raw_dir)
    client = get_http_client(dry_run=args.dry_run)

    logger.info(f"Starting VitalDB ingestion for {len(case_ids)} cases: {case_ids}")
    start_time = time.time()

    success_count = 0
    for case_id in case_ids:
        try:
            logger.info(f"--- Processing Case {case_id} ---")
            vital_file = ensure_vital_downloaded(case_id, raw_dir)
            vf = vitaldb.VitalFile(str(vital_file))
            manifest = load_manifest(case_id, PROJECT_ROOT)

            upsert_case(client, case_id, vf, manifest, dry_run=args.dry_run)
            upsert_tracks(client, case_id, vf, dry_run=args.dry_run)
            upsert_events(client, case_id, vf, dry_run=args.dry_run)
            upsert_signal_windows(client, case_id, vf, dry_run=args.dry_run)

            success_count += 1
            logger.info(f"✓ Case {case_id} ingestion completed successfully.")
        except Exception as exc:
            logger.exception(f"Failed to process Case {case_id}: {exc}")

    elapsed = time.time() - start_time
    logger.info(f"Ingestion finished in {elapsed:.1f}s. Successfully processed {success_count}/{len(case_ids)} cases.")


if __name__ == "__main__":
    main()
