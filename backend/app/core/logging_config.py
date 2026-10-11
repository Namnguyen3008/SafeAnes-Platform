from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import logging.config


class JsonLogFormatter(logging.Formatter):
    """Emit concise JSON records suitable for local logs and container collectors."""

    _FIELDS = (
        "request_id", "method", "path", "status_code", "duration_ms",
        "model_id", "error_type", "application_mode",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in self._FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception_type"] = record.exc_info[0].__name__ if record.exc_info[0] else "Exception"
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(level: str) -> None:
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": "backend.app.core.logging_config.JsonLogFormatter"}},
        "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json", "stream": "ext://sys.stdout"}},
        "root": {"handlers": ["console"], "level": level},
        "loggers": {
            "uvicorn": {"handlers": ["console"], "level": level, "propagate": False},
            "uvicorn.error": {"handlers": ["console"], "level": level, "propagate": False},
            "uvicorn.access": {"handlers": ["console"], "level": level, "propagate": False},
        },
    })
