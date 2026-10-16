from __future__ import annotations

import asyncio
import gc
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.core.errors import ApiServiceError
from backend.app.schemas.api import (
    ReplaySeekRequest,
    ReplaySessionCreate,
    ReplaySessionResponse,
    ReplaySpeedRequest,
)

router = APIRouter(prefix="/replay/sessions", tags=["replay"])
_MAX_STREAM_CATCH_UP_SECONDS = 90.0


@router.post("", response_model=ReplaySessionResponse, status_code=201)
def create_session(body: ReplaySessionCreate, request: Request) -> ReplaySessionResponse:
    try:
        request.app.state.runtime.case_service.ensure_raw_cached(body.case_id)
    except Exception:
        pass
    case = request.app.state.runtime.case_service.get_case(body.case_id)
    result = request.app.state.runtime.replay.create(
        body.case_id,
        case["duration_seconds"],
        body.start_time_s,
        body.speed,
        uc04_model_status=request.app.state.runtime.models.status(UC04_CONTRACT.model_id)["readiness_status"],
        uc05_model_status=request.app.state.runtime.models.status(UC05_CONTRACT.model_id)["readiness_status"],
    )
    return ReplaySessionResponse(**result)


@router.get("/{session_id}", response_model=ReplaySessionResponse)
def get_session(session_id: str, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.get(session_id))


@router.post("/{session_id}/play", response_model=ReplaySessionResponse)
def play(session_id: str, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.play(session_id))


@router.post("/{session_id}/resume", response_model=ReplaySessionResponse)
def resume(session_id: str, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.resume(session_id))


@router.post("/{session_id}/pause", response_model=ReplaySessionResponse)
def pause(session_id: str, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.pause(session_id))


@router.post("/{session_id}/reset", response_model=ReplaySessionResponse)
def reset(session_id: str, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.reset(session_id))


@router.post("/{session_id}/seek", response_model=ReplaySessionResponse)
def seek(session_id: str, body: ReplaySeekRequest, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.seek(session_id, body.time_s))


@router.post("/{session_id}/speed", response_model=ReplaySessionResponse)
def set_speed(session_id: str, body: ReplaySpeedRequest, request: Request) -> ReplaySessionResponse:
    return ReplaySessionResponse(**request.app.state.runtime.replay.set_speed(session_id, body.speed))


@router.get("/{session_id}/stream")
async def stream_session(session_id: str, request: Request) -> StreamingResponse:
    runtime = request.app.state.runtime
    manager = runtime.replay
    manager.get(session_id)  # Validate before opening the stream.

    async def events():
        last_data_time: float | None = None
        while not await request.is_disconnected():
            session = manager.get(session_id)
            yield _sse("snapshot", session)
            current_time = float(session["current_time_seconds"])
            try:
                if last_data_time is None or current_time < last_data_time:
                    frame = await asyncio.to_thread(
                        runtime.replay_stream.snapshot,
                        session["case_id"],
                        current_time,
                    )
                    yield _sse("reset", frame)
                    last_data_time = current_time
                    del frame
                    _trim_memory()
                elif current_time > last_data_time:
                    chunk_limit = runtime.replay_stream.max_chunk_seconds
                    if current_time - last_data_time >= max(
                        _MAX_STREAM_CATCH_UP_SECONDS,
                        chunk_limit * 3,
                    ):
                        frame = await asyncio.to_thread(
                            runtime.replay_stream.snapshot,
                            session["case_id"],
                            current_time,
                        )
                        yield _sse("reset", frame)
                        last_data_time = current_time
                        del frame
                        _trim_memory()
                    else:
                        cursor = last_data_time
                        while cursor < current_time:
                            chunk_end = min(current_time, cursor + chunk_limit)
                            frame = await asyncio.to_thread(
                                runtime.replay_stream.delta,
                                session["case_id"],
                                cursor,
                                chunk_end,
                            )
                            yield _sse("data", frame)
                            cursor = chunk_end
                        last_data_time = current_time
            except ApiServiceError as exc:
                yield _sse("error", {
                    "code": exc.code,
                    "message": exc.message,
                    "case_id": session["case_id"],
                    "as_of_s": current_time,
                })
                return
            except Exception:
                yield _sse("error", {
                    "code": "REPLAY_STREAM_FAILED",
                    "message": "Recorded replay data could not be streamed",
                    "case_id": session["case_id"],
                    "as_of_s": current_time,
                })
                return

            if session["status"] in ("PLAYING", "PAUSED") and getattr(runtime, "replay_scheduler", None) is not None:
                try:
                    inferences = await runtime.replay_scheduler.schedule_if_due(
                        session_id=session["session_id"],
                        generation=session.get("generation", 1),
                        case_id=session["case_id"],
                        current_time_s=current_time,
                        speed=session["speed"],
                    )
                    for inf in inferences:
                        yield _sse("inference_result", inf.as_dict())
                except Exception:
                    pass

            if session["status"] == "COMPLETED":
                yield _sse("complete", session)
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, payload: dict) -> str:
    data = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    return f"event: {event}\ndata: {data}\n\n"


def _trim_memory() -> None:
    gc.collect()
    try:
        import ctypes
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass
