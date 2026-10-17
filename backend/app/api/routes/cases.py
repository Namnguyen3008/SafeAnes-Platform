from __future__ import annotations

from fastapi import APIRouter, Request

from backend.app.core.errors import model_not_ready
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.schemas.api import (
    CaseDetailResponse,
    CasesResponse,
    EventsResponse,
    PredictionsResponse,
    PredictionCacheStatusResponse,
    SignalsResponse,
    TracksResponse,
    UC04ViewResponse,
    UC05ViewResponse,
    WaveformWindowResponse,
)

router = APIRouter(prefix="/cases", tags=["cases", "signals", "inference"])


@router.get("", response_model=CasesResponse)
def list_cases(request: Request) -> CasesResponse:
    return CasesResponse(**request.app.state.runtime.case_service.list_cases())


@router.get("/{case_id}", response_model=CaseDetailResponse)
def case_detail(case_id: str, request: Request) -> CaseDetailResponse:
    return CaseDetailResponse(**request.app.state.runtime.case_service.get_case(case_id))


@router.get("/{case_id}/tracks", response_model=TracksResponse)
def tracks(case_id: str, request: Request) -> TracksResponse:
    return TracksResponse(case_id=case_id, tracks=request.app.state.runtime.case_service.list_tracks(case_id))


@router.get("/{case_id}/signals", response_model=SignalsResponse)
def signals(
    case_id: str,
    request: Request,
    track_name: str,
    start_s: float,
    end_s: float,
) -> SignalsResponse:
    result = request.app.state.runtime.signal_service.signals(case_id, track_name, start_s, end_s)
    return SignalsResponse(**result)


@router.get("/{case_id}/waveforms", response_model=WaveformWindowResponse)
def waveform(
    case_id: str,
    request: Request,
    track_name: str,
    start_s: float,
    end_s: float,
) -> WaveformWindowResponse:
    result = request.app.state.runtime.signal_service.waveform(case_id, track_name, start_s, end_s)
    return WaveformWindowResponse(**result)


@router.get("/{case_id}/events", response_model=EventsResponse)
def events(case_id: str, request: Request) -> EventsResponse:
    return EventsResponse(**request.app.state.runtime.signal_service.events(case_id))


@router.get("/{case_id}/predictions/uc04", response_model=PredictionsResponse)
def uc04_predictions(
    case_id: str,
    request: Request,
    prediction_time_s: float | None = None,
    as_of_s: float | None = None,
    window_start_s: float | None = None,
) -> PredictionsResponse:
    model_id = "SafeAnes-UC04-HypoFormer"
    if as_of_s is not None:
        status = request.app.state.runtime.models.status(model_id)
        if not status["inference_ready"]:
            raise model_not_ready(
                "UC04 prediction output is unavailable while its model runtime is blocked",
                details={"readiness_status": status["readiness_status"], "blockers": status["blockers"]},
            )
        if prediction_time_s is not None:
            from backend.app.core.errors import ApiServiceError

            raise ApiServiceError(
                "INVALID_REQUEST",
                "Use either prediction_time_s for on-demand inference or as_of_s for cached replay outputs",
                status_code=422,
            )
        request.app.state.runtime.case_service.get_case(case_id)
        result = request.app.state.runtime.uc04_batch.cache.read_predictions(
            case_id, as_of_s=as_of_s, window_start_s=window_start_s
        )
        return PredictionsResponse(**result)
    if prediction_time_s is None:
        from backend.app.core.errors import ApiServiceError

        raise ApiServiceError(
            "INVALID_REQUEST",
            "prediction_time_s is required for on-demand inference; use as_of_s to read cached outputs",
            status_code=422,
        )
    predictions = request.app.state.runtime.models.predict(case_id, model_id, prediction_time_s)
    return PredictionsResponse(
        case_id=case_id,
        model_id=model_id,
        predictions=predictions,
        source="LIVE_INFERENCE",
        available_horizons_minutes=_prediction_horizons(predictions),
    )


@router.get("/{case_id}/predictions/uc04/cache-status", response_model=PredictionCacheStatusResponse)
def uc04_prediction_cache_status(case_id: str, request: Request) -> PredictionCacheStatusResponse:
    request.app.state.runtime.case_service.get_case(case_id)
    runtime = request.app.state.runtime
    status = runtime.models.status("SafeAnes-UC04-HypoFormer")
    if not status["inference_ready"]:
        return PredictionCacheStatusResponse(
            case_id=case_id,
            model_id=status["model_id"],
            model_version=status["model_version"],
            artifact_sha256=status["artifact_hash"],
            cache_status="NOT_READY",
            prediction_count=0,
            inference_window_count=0,
            abstained_window_count=0,
        )
    return PredictionCacheStatusResponse(**runtime.uc04_batch.cache.status(case_id))


@router.get("/{case_id}/uc04-view", response_model=UC04ViewResponse)
def uc04_view(
    case_id: str,
    request: Request,
    as_of_s: float,
    window_seconds: float = 1800.0,
) -> UC04ViewResponse:
    return UC04ViewResponse(**request.app.state.runtime.uc04_view.read(
        case_id, as_of_s=as_of_s, window_seconds=window_seconds
    ))


@router.get("/{case_id}/predictions/uc05", response_model=PredictionsResponse)
def uc05_predictions(
    case_id: str,
    request: Request,
    prediction_time_s: float | None = None,
    as_of_s: float | None = None,
    window_start_s: float | None = None,
) -> PredictionsResponse:
    model_id = UC05_CONTRACT.model_id
    runtime = request.app.state.runtime
    model_status = runtime.models.status(model_id)
    if not model_status["inference_ready"]:
        raise model_not_ready(
            "UC05 prediction output is unavailable while its audited input contract is blocked",
            details={"readiness_status": model_status["readiness_status"], "blockers": model_status["blockers"]},
        )
    if as_of_s is not None:
        if prediction_time_s is not None:
            from backend.app.core.errors import ApiServiceError
            raise ApiServiceError("INVALID_REQUEST", "Use either prediction_time_s or as_of_s", status_code=422)
        runtime.case_service.get_case(case_id)
        result = runtime.uc05_batch.cache.read_predictions(
            case_id, as_of_s=as_of_s, window_start_s=window_start_s
        )
        return PredictionsResponse(**result)
    if prediction_time_s is None:
        from backend.app.core.errors import ApiServiceError
        raise ApiServiceError("INVALID_REQUEST", "prediction_time_s or as_of_s is required", status_code=422)
    predictions = runtime.models.predict(case_id, model_id, prediction_time_s)
    return PredictionsResponse(
        case_id=case_id,
        model_id=model_id,
        predictions=predictions,
        source="LIVE_INFERENCE",
        available_horizons_minutes=_prediction_horizons(predictions),
    )


@router.get("/{case_id}/predictions/uc05/cache-status", response_model=PredictionCacheStatusResponse)
def uc05_prediction_cache_status(case_id: str, request: Request) -> PredictionCacheStatusResponse:
    runtime = request.app.state.runtime
    runtime.case_service.get_case(case_id)
    status = runtime.models.status(UC05_CONTRACT.model_id)
    if not status["inference_ready"]:
        return PredictionCacheStatusResponse(
            case_id=case_id,
            model_id=UC05_CONTRACT.model_id,
            model_version=UC05_CONTRACT.model_version,
            artifact_sha256=UC05_CONTRACT.artifact_sha256,
            cache_status="NOT_READY",
            prediction_count=0,
            inference_window_count=0,
            abstained_window_count=0,
        )
    return PredictionCacheStatusResponse(**runtime.uc05_batch.cache.status(case_id))


@router.get("/{case_id}/uc05-view", response_model=UC05ViewResponse)
def uc05_view(
    case_id: str,
    request: Request,
    as_of_s: float,
    window_seconds: float = 1800.0,
) -> UC05ViewResponse:
    return UC05ViewResponse(**request.app.state.runtime.uc05_view.read(
        case_id, as_of_s=as_of_s, window_seconds=window_seconds
    ))


def _prediction_horizons(predictions: list[dict]) -> list[int]:
    return sorted({
        horizon
        for prediction in predictions
        if isinstance((horizon := prediction.get("horizon_if_applicable")), int)
        and not isinstance(horizon, bool)
    })
