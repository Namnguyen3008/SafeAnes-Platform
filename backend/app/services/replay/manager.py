from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import threading
import time
import uuid

from backend.app.core.errors import ApiServiceError, invalid_time_range


SUPPORTED_SPEEDS = (1, 2, 5, 10, 30, 60)


@dataclass
class ReplaySession:
    session_id: str
    case_id: str
    duration_seconds: float
    current_time_s: float
    speed: int
    status: str
    created_at_utc: str
    started_at: str | None
    updated_at: str
    uc04_model_status: str
    uc05_model_status: str
    _anchor_time_s: float
    _anchor_monotonic: float
    generation: int = 1


class ReplayManager:
    """Ephemeral, process-local replay state for this single-process API."""

    def __init__(self) -> None:
        self._sessions: dict[str, ReplaySession] = {}
        self._lock = threading.RLock()

    def close(self) -> None:
        """Release in-memory sessions during application shutdown."""
        with self._lock:
            self._sessions.clear()

    def create(
        self,
        case_id: str,
        duration_seconds: float,
        start_time_s: float,
        speed: int,
        *,
        uc04_model_status: str = "UNKNOWN",
        uc05_model_status: str = "UNKNOWN",
    ) -> dict:
        self._validate_time(start_time_s, duration_seconds)
        self._validate_speed(speed)
        now = datetime.now(timezone.utc).isoformat()
        session = ReplaySession(
            session_id=str(uuid.uuid4()), case_id=case_id,
            duration_seconds=float(duration_seconds), current_time_s=float(start_time_s),
            speed=speed, status="STOPPED", created_at_utc=now,
            started_at=None, updated_at=now,
            uc04_model_status=str(uc04_model_status), uc05_model_status=str(uc05_model_status),
            _anchor_time_s=float(start_time_s), _anchor_monotonic=time.monotonic(),
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return self._snapshot(session)

    def get(self, session_id: str) -> dict:
        with self._lock:
            session = self._require(session_id)
            if self._advance(session):
                self._touch(session)
            return self._snapshot(session)

    def play(self, session_id: str) -> dict:
        with self._lock:
            session = self._require(session_id)
            if self._advance(session):
                self._touch(session)
            if session.current_time_s >= session.duration_seconds:
                session.current_time_s = 0.0
            session.status = "PLAYING"
            if session.started_at is None:
                session.started_at = self._now()
            self._touch(session)
            self._anchor(session)
            return self._snapshot(session)

    def resume(self, session_id: str) -> dict:
        with self._lock:
            session = self._require(session_id)
            if self._advance(session):
                self._touch(session)
            if session.current_time_s >= session.duration_seconds:
                session.current_time_s = 0.0
            session.status = "PLAYING"
            if session.started_at is None:
                session.started_at = self._now()
            self._touch(session)
            self._anchor(session)
            return self._snapshot(session)

    def pause(self, session_id: str) -> dict:
        with self._lock:
            session = self._require(session_id)
            if self._advance(session):
                self._touch(session)
            if session.status == "PLAYING":
                session.status = "PAUSED"
                self._anchor(session)
            self._touch(session)
            return self._snapshot(session)

    def reset(self, session_id: str) -> dict:
        with self._lock:
            session = self._require(session_id)
            session.current_time_s = 0.0
            session.status = "STOPPED"
            session.started_at = None
            session.generation += 1
            self._touch(session)
            self._anchor(session)
            return self._snapshot(session)

    def seek(self, session_id: str, time_s: float) -> dict:
        with self._lock:
            session = self._require(session_id)
            self._validate_time(time_s, session.duration_seconds)
            session.current_time_s = float(time_s)
            session.status = "COMPLETED" if time_s >= session.duration_seconds else "PAUSED"
            session.generation += 1
            self._touch(session)
            self._anchor(session)
            return self._snapshot(session)

    def set_speed(self, session_id: str, speed: int) -> dict:
        with self._lock:
            session = self._require(session_id)
            if self._advance(session):
                self._touch(session)
            self._validate_speed(speed)
            session.speed = speed
            self._touch(session)
            self._anchor(session)
            return self._snapshot(session)

    def _require(self, session_id: str) -> ReplaySession:
        session = self._sessions.get(session_id)
        if session is None:
            raise ApiServiceError("REPLAY_SESSION_NOT_FOUND", "Replay session was not found", status_code=404)
        return session

    @staticmethod
    def _validate_speed(speed: int) -> None:
        if speed not in SUPPORTED_SPEEDS:
            raise ApiServiceError("INVALID_SPEED", "Speed must be one of 1, 2, 5, 10, 30, or 60", status_code=422)

    @staticmethod
    def _validate_time(time_s: float, duration: float) -> None:
        if not 0 <= float(time_s) <= float(duration):
            raise invalid_time_range("Replay time must be within the case duration")

    @staticmethod
    def _anchor(session: ReplaySession) -> None:
        session._anchor_time_s = session.current_time_s
        session._anchor_monotonic = time.monotonic()

    @staticmethod
    def _advance(session: ReplaySession) -> bool:
        if session.status != "PLAYING":
            return False
        elapsed = max(0.0, time.monotonic() - session._anchor_monotonic)
        current = session._anchor_time_s + elapsed * session.speed
        previous = session.current_time_s
        if current >= session.duration_seconds:
            session.current_time_s = session.duration_seconds
            session.status = "COMPLETED"
        else:
            session.current_time_s = current
        return session.current_time_s != previous

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _touch(cls, session: ReplaySession) -> None:
        session.updated_at = cls._now()

    @staticmethod
    def _snapshot(session: ReplaySession) -> dict:
        return {
            "session_id": session.session_id,
            "case_id": session.case_id,
            "status": session.status,
            "current_time_s": session.current_time_s,
            "current_time_seconds": session.current_time_s,
            "duration_seconds": session.duration_seconds,
            "speed": session.speed,
            "created_at_utc": session.created_at_utc,
            "started_at": session.started_at,
            "updated_at": session.updated_at,
            "uc04_model_status": session.uc04_model_status,
            "uc05_model_status": session.uc05_model_status,
            "time_basis": "seconds_since_case_start",
            "generation": session.generation,
        }
