from __future__ import annotations

from collections import OrderedDict
import json
import threading
from pathlib import Path
from typing import Any, Callable

from backend.app.core.errors import cache_not_ready


FileSignature = tuple[int, int, int, int]


class VerifiedJsonFileCache:
    """Small LRU for immutable, atomically replaced local prediction files."""

    def __init__(self, max_entries: int) -> None:
        if max_entries < 1:
            raise ValueError("prediction file cache must retain at least one case")
        self.max_entries = max_entries
        self._entries: OrderedDict[str, tuple[FileSignature, dict[str, Any]]] = OrderedDict()
        self._lock = threading.RLock()

    def read(
        self,
        key: str,
        path: Path,
        *,
        unavailable_message: str,
        validate: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        for _attempt in range(3):
            try:
                signature = self._signature(path)
            except OSError as exc:
                raise cache_not_ready(unavailable_message) from exc

            with self._lock:
                cached = self._entries.get(key)
                if cached is not None and cached[0] == signature:
                    self._entries.move_to_end(key)
                    return cached[1]

                try:
                    record = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    self._entries.pop(key, None)
                    raise cache_not_ready(unavailable_message) from exc
                if not isinstance(record, dict):
                    self._entries.pop(key, None)
                    raise cache_not_ready(unavailable_message)

                validate(record)
                # The file may have been atomically replaced during the read.
                # Do not associate it with a newer file's signature.
                try:
                    after_read_signature = self._signature(path)
                except OSError as exc:
                    self._entries.pop(key, None)
                    raise cache_not_ready(unavailable_message) from exc
                if after_read_signature != signature:
                    self._entries.pop(key, None)
                    continue

                self._entries[key] = (signature, record)
                self._entries.move_to_end(key)
                while len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
                return record

        raise cache_not_ready(unavailable_message)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._entries.pop(key, None)

    @staticmethod
    def _signature(path: Path) -> FileSignature:
        metadata = path.stat()
        return (
            metadata.st_mtime_ns,
            metadata.st_ctime_ns,
            metadata.st_size,
            getattr(metadata, "st_ino", 0),
        )
