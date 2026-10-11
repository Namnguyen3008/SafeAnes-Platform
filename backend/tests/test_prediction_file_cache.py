from __future__ import annotations

import json
import os
from pathlib import Path
import time

from backend.app.core.errors import ApiServiceError
from backend.app.services.inference.prediction_file_cache import VerifiedJsonFileCache


def _read(cache: VerifiedJsonFileCache, key: str, path: Path):
    return cache.read(key, path, unavailable_message="prediction file unavailable", validate=lambda _: None)


def test_verified_json_file_cache_detects_atomic_replacement(tmp_path):
    path = tmp_path / "predictions.json"
    path.write_text(json.dumps({"generation": 1}), encoding="utf-8")
    cache = VerifiedJsonFileCache(max_entries=2)

    assert _read(cache, "case-a", path)["generation"] == 1

    replacement = tmp_path / "replacement.json"
    replacement.write_text(json.dumps({"generation": 2, "changed": True}), encoding="utf-8")
    time.sleep(0.002)
    os.replace(replacement, path)

    assert _read(cache, "case-a", path)["generation"] == 2


def test_verified_json_file_cache_evicts_least_recently_used_case(tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    first.write_text('{"case": "first"}', encoding="utf-8")
    second.write_text('{"case": "second"}', encoding="utf-8")
    cache = VerifiedJsonFileCache(max_entries=1)
    validation_count = 0

    def validate(_: dict) -> None:
        nonlocal validation_count
        validation_count += 1

    cache.read("first", first, unavailable_message="unavailable", validate=validate)
    cache.read("second", second, unavailable_message="unavailable", validate=validate)
    cache.read("first", first, unavailable_message="unavailable", validate=validate)

    assert len(cache._entries) == 1
    assert validation_count == 3


def test_verified_json_file_cache_rejects_invalid_json(tmp_path):
    path = tmp_path / "predictions.json"
    path.write_text("not-json", encoding="utf-8")
    cache = VerifiedJsonFileCache(max_entries=1)

    try:
        _read(cache, "case-a", path)
    except ApiServiceError as error:
        assert error.code == "CACHE_NOT_READY"
    else:
        raise AssertionError("invalid prediction JSON must not be cached")
