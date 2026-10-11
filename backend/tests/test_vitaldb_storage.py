from io import BytesIO

import pytest

from backend.app.vitaldb.storage import ImmutableVitalDBStore


def _valid_vital_file(path):
    return path.read_bytes().startswith(b"VITALDB-TEST")


def test_store_preserves_raw_bytes_and_returns_stable_checksum(tmp_path):
    store = ImmutableVitalDBStore(tmp_path, validator=_valid_vital_file)
    content = b"VITALDB-TEST\x00raw-record"

    result = store.store_stream(
        41,
        BytesIO(content),
        source_uri="https://api.vitaldb.net/1.0.1/41.vital",
    )

    assert result.path.read_bytes() == content
    assert result.sha256 == "376c510d9de642346e6c856f9e88d59927f5a58afcc90703995ea3d82ecf65d6"
    assert result.path.name == "41.vital"


def test_store_refuses_to_replace_existing_raw_record(tmp_path):
    store = ImmutableVitalDBStore(tmp_path, validator=_valid_vital_file)
    first = store.store_stream(
        41,
        BytesIO(b"VITALDB-TEST-original"),
        source_uri="https://api.vitaldb.net/1.0.1/41.vital",
    )

    with pytest.raises(FileExistsError):
        store.store_stream(
            41,
            BytesIO(b"VITALDB-TEST-changed"),
            source_uri="https://api.vitaldb.net/1.0.1/41.vital",
        )

    assert first.path.read_bytes() == b"VITALDB-TEST-original"


def test_invalid_record_is_not_left_in_raw_cache(tmp_path):
    store = ImmutableVitalDBStore(tmp_path, validator=_valid_vital_file)

    with pytest.raises(ValueError, match="VitalDB format"):
        store.store_stream(
            41,
            BytesIO(b"not a vital file"),
            source_uri="https://api.vitaldb.net/1.0.1/41.vital",
        )

    assert list((tmp_path / "raw").glob("41.vital")) == []
def test_store_removes_partial_raw_file_after_stream_failure(tmp_path):
    store = ImmutableVitalDBStore(tmp_path, validator=_valid_vital_file)

    class InterruptedStream:
        calls = 0

        def read(self, size):
            self.calls += 1
            if self.calls == 1:
                return b"VITALDB-TEST-partial"
            raise OSError("connection reset")

    with pytest.raises(OSError, match="connection reset"):
        store.store_stream(
            41,
            InterruptedStream(),
            source_uri="https://api.vitaldb.net/1.0.1/41.vital",
        )

    assert not list((tmp_path / "raw").glob("41.vital"))
    assert not list((tmp_path / "raw").glob("*.vital"))


def test_official_uri_builder_rejects_non_numeric_case_ids():
    from backend.app.vitaldb.storage import build_official_case_uri

    with pytest.raises(ValueError):
        build_official_case_uri("../41", "1.0.1")
