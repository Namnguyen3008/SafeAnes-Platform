from __future__ import annotations

import argparse
import json
import sys

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError
from backend.app.main import BackendRuntime
from backend.app.ml.registry.contracts import UC05_CONTRACT


def main() -> int:
    parser = argparse.ArgumentParser(description="Precompute audited UC05 outputs for validated local VitalDB cases.")
    parser.add_argument("--case-id", action="append", dest="case_ids", help="UC05 eligible case ID; may be repeated")
    parser.add_argument("--force", action="store_true", help="Recompute cached predictions")
    args = parser.parse_args()
    runtime = BackendRuntime(settings=Settings.from_env(), load_models=True)
    runtime.initialize()
    try:
        summaries = runtime.uc05_batch.generate_all(case_ids=args.case_ids, force=args.force)
    except ApiServiceError as exc:
        print(json.dumps({"error": {"code": exc.code, "message": exc.message, "details": exc.details}}, indent=2))
        return 1
    print(json.dumps({"model_id": UC05_CONTRACT.model_id, "results": [
        {key: value for key, value in item.items() if key != "predictions"} for item in summaries
    ]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
