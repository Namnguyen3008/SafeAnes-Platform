from __future__ import annotations

import logging
import os
from typing import Any

try:
    import httpx
except ImportError:
    httpx = None
import json
import urllib.request
import urllib.error

logger = logging.getLogger("safeanes.supabase_repository")


class SupabaseVitalDBRepository:
    """Cloud-based L3 repository communicating with Supabase PostgreSQL and Storage.
    
    Acts as the persistent backing store for case manifests, pre-partitioned signal
    windows, and recorded model inference audits.
    """

    def __init__(
        self,
        supabase_url: str | None = None,
        supabase_key: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.supabase_url = (
            supabase_url
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
            or os.getenv("SUPABASE_URL")
            or "https://nntxlqchytvfmutmixea.supabase.co"
        ).rstrip("/")
        self.supabase_key = (
            supabase_key
            or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
            or os.getenv("SUPABASE_KEY")
            or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHhscWNoeXR2Zm11dG1peGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Nzk3OTcsImV4cCI6MjEwMTU1NTc5N30.robUviwFKiyoXaYEKRjM2JyhTCWO6vC5BlRkA_vD3D4"
        )
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }

    def _get(self, url: str) -> list[dict[str, Any]] | dict[str, Any] | None:
        if httpx is not None:
            with httpx.Client(headers=self._headers(), timeout=self.timeout) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                return None
        req = urllib.request.Request(url, headers=self._headers())
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
        return None

    def _post(self, url: str, data: list[dict[str, Any]]) -> bool:
        if httpx is not None:
            with httpx.Client(headers=self._headers(), timeout=self.timeout) as client:
                resp = client.post(url, json=data)
                return resp.status_code in (200, 201)
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return resp.status in (200, 201)

    def is_connected(self) -> bool:
        """Ping Supabase REST health endpoint."""
        try:
            url = f"{self.supabase_url}/rest/v1/"
            if httpx is not None:
                with httpx.Client(headers=self._headers(), timeout=5.0) as client:
                    resp = client.get(url)
                    return resp.status_code in (200, 404, 401)
            req = urllib.request.Request(url, headers=self._headers())
            try:
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    return resp.status in (200, 404, 401)
            except urllib.error.HTTPError as exc:
                return exc.code in (200, 404, 401)
        except Exception:
            return False

    def list_cases(self) -> list[dict[str, Any]]:
        """List cases registered in Supabase safeanes_cases."""
        try:
            url = f"{self.supabase_url}/rest/v1/safeanes_cases?select=*&order=id.asc"
            data = self._get(url)
            if isinstance(data, list):
                return data
        except Exception as exc:
            logger.warning(f"Supabase list_cases failed: {exc}")
        return []

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        """Fetch a specific case by id from Supabase."""
        try:
            url = f"{self.supabase_url}/rest/v1/safeanes_cases?id=eq.{case_id}&select=*"
            data = self._get(url)
            if isinstance(data, list) and data:
                return data[0]
        except Exception as exc:
            logger.warning(f"Supabase get_case({case_id}) failed: {exc}")
        return None

    def get_signal_window(self, case_id: str, timestamp_s: float) -> dict[str, Any] | None:
        """Find the 30-minute signal window containing the given timestamp."""
        try:
            url = (
                f"{self.supabase_url}/rest/v1/safeanes_signal_windows"
                f"?case_id=eq.{case_id}&window_start_s=lte.{timestamp_s}&window_end_s=gte.{timestamp_s}"
                f"&select=*&limit=1"
            )
            data = self._get(url)
            if isinstance(data, list) and data:
                return data[0]
        except Exception as exc:
            logger.warning(f"Supabase get_signal_window failed: {exc}")
        return None

    def save_live_prediction(
        self,
        session_id: str,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
        predictions: list[dict[str, Any]],
        latency_ms: float,
        generation: int = 1,
    ) -> bool:
        """Persist a live inference run audit into Supabase safeanes_audit_log."""
        try:
            record = {
                "action": "LIVE_INFERENCE",
                "entity_type": "MODEL_PREDICTION",
                "entity_id": f"{case_id}_{int(prediction_time_s)}",
                "actor_id": f"session_{session_id}",
                "changes": {
                    "model_id": model_id,
                    "prediction_time_s": prediction_time_s,
                    "predictions": predictions,
                    "latency_ms": latency_ms,
                    "generation": generation,
                },
            }
            url = f"{self.supabase_url}/rest/v1/safeanes_audit_log"
            return self._post(url, [record])
        except Exception as exc:
            logger.debug(f"Failed to record live prediction audit to Supabase: {exc}")
            return False
