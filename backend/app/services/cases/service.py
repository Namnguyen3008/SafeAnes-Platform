from __future__ import annotations

from typing import Any

from backend.app.repositories.case_repository import CaseRepository


class CaseService:
    def __init__(self, repository: CaseRepository) -> None:
        self.repository = repository

    def list_cases(self) -> dict[str, Any]:
        return self.repository.list_cases()

    def get_case(self, case_id: str) -> dict[str, Any]:
        return self.repository.get_case(case_id)

    def list_tracks(self, case_id: str) -> list[dict[str, Any]]:
        self.repository.get_case(case_id)
        return self.repository.list_tracks(case_id)

    def ensure_raw_cached(self, case_id: str) -> Any:
        return self.repository.ensure_raw_cached(case_id)

