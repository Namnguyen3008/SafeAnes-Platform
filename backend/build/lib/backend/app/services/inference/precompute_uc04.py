from __future__ import annotations

import argparse
import json
import sys

from backend.app.core.errors import ApiServiceError
from backend.app.main import BackendRuntime
from backend.app.core.config import Settings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Precompute verified UC04 predictions for locally cached VitalDB cases."
    )
    parser.add_argument("--case-id", action="append", dest="case_ids", help="UC04-eligible case ID; may be repeated")
    parser.add_argument("--force", action="store_true", help="Recompute matching prediction caches")
    args = parser.parse_args()

    runtime = BackendRuntime(settings=Settings.from_env(), load_models=True)
    runtime.initialize()
    try:
        summaries = runtime.uc04_batch.generate_all(case_ids=args.case_ids, force=args.force)
    except ApiServiceError as exc:
        print(json.dumps({"error": {"code": exc.code, "message": exc.message, "details": exc.details}}, indent=2))
        return 1

    print(json.dumps({
        "model_id": "SafeAnes-UC04-HypoFormer",
        "results": [
            {key: value for key, value in summary.items() if key != "predictions"}
            for summary in summaries
        ],
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
