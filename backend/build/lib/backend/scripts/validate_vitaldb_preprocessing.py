from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.ml.preprocessing.vitaldb_pipeline import (
    ModelWindowBuilder,
    TrainingPreprocessorAdapter,
    VitalDBTrackReader,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_write(path: Path, content: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(content, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _manifest_case_metadata(manifest: dict[str, Any]) -> dict[str, Any]:
    context = manifest.get("patient_context", {})
    names = ("age", "sex", "asa", "bmi", "weight", "height", "emop")
    return {
        key: None if context.get(key) == "NOT_RECORDED" else context.get(key)
        for key in names
    }


def build_validation_report(project_root: str | Path) -> dict[str, Any]:
    root = Path(project_root).resolve()
    catalog_path = root / "backend/data/manifests/vitaldb_case_catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    reader = VitalDBTrackReader()
    windows = ModelWindowBuilder()
    adapter = TrainingPreprocessorAdapter()
    records: list[dict[str, Any]] = []
    case_errors: list[dict[str, str]] = []

    for catalog_case in catalog.get("cases", []):
        case_id = str(catalog_case["case_id"])
        manifest_path = root / "backend/data/vitaldb/manifests" / f"{case_id}.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        raw_path = root / "backend/data/vitaldb" / manifest["raw_file"]["relative_path"]
        actual_sha256 = _sha256(raw_path)
        if actual_sha256 != manifest["raw_file"]["sha256"]:
            case_errors.append({"case_id": case_id, "error": "raw checksum mismatch"})
            continue

        metadata = _manifest_case_metadata(manifest)
        for model_id in (UC04_CONTRACT.model_id, UC05_CONTRACT.model_id):
            try:
                series = reader.read_case(
                    model_id,
                    case_id,
                    source_path=str(raw_path),
                    case_metadata=metadata,
                )
                for prediction_time in windows.candidate_times(series):
                    window = windows.build(series, prediction_time)
                    result = adapter.prepare(model_id, window, case_signals=series)
                    records.append(dict(result.report))
            except Exception as exc:
                case_errors.append({
                    "case_id": case_id,
                    "model_id": model_id,
                    "error": f"{type(exc).__name__}: {exc}",
                })

    summaries: dict[str, dict[str, int]] = {}
    for model_id in (UC04_CONTRACT.model_id, UC05_CONTRACT.model_id):
        selected = [row for row in records if row["model_id"] == model_id]
        summaries[model_id] = {
            "windows_examined": len(selected),
            "input_eligible": sum(bool(row["input_eligible"]) for row in selected),
            "inference_eligible": sum(bool(row["inference_eligible"]) for row in selected),
            "abstained": sum(not bool(row["inference_eligible"]) for row in selected),
        }

    return {
        "schema_version": "1.0",
        "report_type": "VitalDB-to-model preprocessing window validation",
        "dataset": catalog["dataset"],
        "dataset_version": catalog["dataset_version"],
        "source_catalog_sha256": _sha256(catalog_path),
        "raw_case_checksums": {
            str(case["case_id"]): case["raw_file_sha256"]
            for case in (
                {
                    "case_id": item["case_id"],
                    "raw_file_sha256": json.loads(
                        (root / "backend/data/vitaldb/manifests" / f"{item['case_id']}.json").read_text(encoding="utf-8")
                    )["raw_file"]["sha256"],
                }
                for item in catalog.get("cases", [])
            )
        },
        "model_contract_versions": {
            UC04_CONTRACT.model_id: UC04_CONTRACT.model_version,
            UC05_CONTRACT.model_id: UC05_CONTRACT.model_version,
        },
        "preprocessing_versions": {
            "UC04": "notebook-compat/uc04-a152750f",
            "UC05": "notebook-compat/uc05-95b2d441",
        },
        "candidate_stride_seconds": {
            UC04_CONTRACT.model_id: UC04_CONTRACT.stride_seconds,
            UC05_CONTRACT.model_id: UC05_CONTRACT.stride_seconds,
        },
        "window_summaries": summaries,
        "case_errors": case_errors,
        "windows": records,
        "limitations": [
            "UC05 input tensors can be inspected, but inference remains blocked by the exported schema/stream-evaluator contract mismatch.",
            "VitalDB track units absent from source metadata are reported NOT_RECORDED; no unit conversion is invented.",
            "This report validates input construction and preprocessing only; it does not run model predictions or establish clinical validity.",
        ],
    }


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        "# VitalDB preprocessing validation",
        "",
        f"- Dataset: {report['dataset']} `{report['dataset_version']}`.",
        f"- Catalog SHA-256: `{report['source_catalog_sha256']}`.",
        "- Window generation uses contract-defined numeric history and stride; only case-time samples before each prediction time are read.",
        "- No labels, future events, or model predictions are inputs to preprocessing validation.",
        "",
        "| Model | Windows examined | Input eligible | Inference eligible | Abstained |",
        "|---|---:|---:|---:|---:|",
    ]
    for model_id, summary in report["window_summaries"].items():
        lines.append(
            f"| {model_id} | {summary['windows_examined']} | {summary['input_eligible']} | "
            f"{summary['inference_eligible']} | {summary['abstained']} |"
        )
    lines.extend(["", "## Limitations", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    if report["case_errors"]:
        lines.extend(["", "## Case errors", ""])
        lines.extend(
            f"- Case {item['case_id']} ({item.get('model_id', 'case')}): {item['error']}"
            for item in report["case_errors"]
        )
    else:
        lines.extend(["", "No raw checksum or case loading errors were recorded."])
    lines.extend([
        "",
        "Each window record, including feature states, observed coverage, shape, and abstain reason, is in `backend/data/vitaldb/processed/preprocessing_validation_report.json`.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate exact UC04/UC05 preprocessing tensors from selected local VitalDB records."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=PROJECT_ROOT,
    )
    args = parser.parse_args()
    root = args.project_root.resolve()
    report = build_validation_report(root)
    report_path = root / "backend/data/vitaldb/processed/preprocessing_validation_report.json"
    markdown_path = root / "docs/integration/VITALDB_PREPROCESSING_VALIDATION.md"
    _json_write(report_path, report)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(_markdown(report), encoding="utf-8")
    print(json.dumps({
        "report_path": str(report_path),
        "markdown_path": str(markdown_path),
        "window_summaries": report["window_summaries"],
        "case_errors": report["case_errors"],
    }, indent=2))
    return 1 if report["case_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
