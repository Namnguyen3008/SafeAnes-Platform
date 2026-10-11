"""Inference services for the allowlisted SafeAnes model artifacts."""

from .uc04 import UC04InferenceService
from .uc05 import UC05InferenceService

__all__ = ["UC04InferenceService", "UC05InferenceService"]
