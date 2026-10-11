from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.schemas.api import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(status="alive", components={"api": "UP"})


@router.get("/ready", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
def ready(request: Request):
    runtime = request.app.state.runtime
    statuses = runtime.models.statuses()
    dataset_cache = runtime.cases.dataset_cache_status
    components = {
        "case_catalog": "READY" if runtime.cases.catalog_ready else "NOT_READY",
        "dataset_cache": dataset_cache["status"],
        "cached_case_count": dataset_cache["cached_case_count"],
        "uc04_model": next(item["readiness_status"] for item in statuses if item["model_id"].endswith("UC04-HypoFormer")),
        "uc05_model": next(item["readiness_status"] for item in statuses if item["model_id"].endswith("UC05-RespFormer")),
    }
    is_ready = (
        components["case_catalog"] == "READY"
        and components["dataset_cache"] == "READY"
        and all(item["inference_ready"] for item in statuses)
    )
    response = HealthResponse(status="ready" if is_ready else "not_ready", ready=is_ready, components=components)
    if not is_ready:
        return JSONResponse(status_code=503, content=response.model_dump())
    return response
