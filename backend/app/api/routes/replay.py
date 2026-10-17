from __future__ import annotations

import asyncio
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
        inference_task: asyncio.Task | None = None
        inference_snapshot: dict | None = None
        try:
            while not await request.is_disconnected():
                session = manager.get(session_id)

                if inference_task is not None and inference_task.done():
                    completed_task = inference_task
                    scheduled_snapshot = inference_snapshot
                    inference_task = None
                    inference_snapshot = None
                    inference_failed = False
                    inference_results = []
                    try:
                        inference_results = completed_task.result() or []
                    except asyncio.CancelledError:
                        pass
                    except Exception:
                        inference_failed = True

                    # Refresh after inference completes so seek/reset results are discarded.
                    session = manager.get(session_id)
                    matches_current_session = (
                        scheduled_snapshot is not None
                        and session.get("session_id") == scheduled_snapshot.get("session_id")
                        and session.get("case_id") == scheduled_snapshot.get("case_id")
                        and session.get("generation") == scheduled_snapshot.get("generation")
                    )
                    if matches_current_session and inference_failed:
                        yield _sse("inference_error", {
                            "session_id": scheduled_snapshot["session_id"],
                            "generation": scheduled_snapshot["generation"],
                            "case_id": scheduled_snapshot["case_id"],
                            "code": "LIVE_INFERENCE_FAILED",
                        })
                    elif matches_current_session:
                        for result in inference_results:
                            try:
                                payload = result.as_dict()
                            except Exception:
                                yield _sse("inference_error", {
                                    "session_id": scheduled_snapshot["session_id"],
                                    "generation": scheduled_snapshot["generation"],
                                    "case_id": scheduled_snapshot["case_id"],
                                    "code": "LIVE_INFERENCE_FAILED",
                                })
                                break
                            if (
                                payload.get("session_id") != session.get("session_id")
                                or payload.get("case_id") != session.get("case_id")
                                or payload.get("generation") != session.get("generation")
                            ):
                                continue
                            event_name = payload.pop("event", None)
                            if event_name in {"inference_result", "inference_error"}:
                                yield _sse(event_name, payload)

                # One task per stream; while it is pending, subsequent ticks coalesce to
                # the latest manager snapshot and are scheduled after this task completes.
                if inference_task is None and session.get("status") == "PLAYING":
                    inference_snapshot = dict(session)
                    inference_task = asyncio.create_task(
                        runtime.replay_scheduler.schedule_if_due(inference_snapshot)
                    )

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

                if session["status"] == "COMPLETED":
                    yield _sse("complete", session)
                    return
                await asyncio.sleep(0.5)
        finally:
            if inference_task is not None:
                if not inference_task.done():
                    inference_task.cancel()
                try:
                    await inference_task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, payload: dict) -> str:
    data = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    return f"event: {event}\ndata: {data}\n\n"
