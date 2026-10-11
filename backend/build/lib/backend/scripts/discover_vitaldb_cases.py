from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.vitaldb.pipeline import run_case_discovery  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Discover and validate actual official VitalDB cases against SafeAnes UC04/UC05 inputs."
    )
    parser.add_argument(
        "--inspection-budget",
        type=int,
        default=80,
        help="Maximum fully inspected candidates; candidates are sampled deterministically across the index.",
    )
    parser.add_argument(
        "--target-per-model",
        type=int,
        default=3,
        help="Target number of locally revalidated cases per UC (not a fabricated-result requirement).",
    )
    parser.add_argument(
        "--dual-target",
        type=int,
        default=2,
        help="Preferred number of cases with independent UC04 and UC05 valid windows.",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=PROJECT_ROOT,
        help="SafeAnes project root.",
    )
    args = parser.parse_args()
    if min(args.inspection_budget, args.target_per_model, args.dual_target) < 0:
        parser.error("budget and targets cannot be negative")
    try:
        result = run_case_discovery(
            project_root=args.project_root,
            inspection_budget=args.inspection_budget,
            target_per_model=args.target_per_model,
            dual_target=args.dual_target,
        )
    except Exception as exc:
        print(f"VitalDB discovery failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
