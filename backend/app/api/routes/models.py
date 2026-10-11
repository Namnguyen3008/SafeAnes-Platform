from fastapi import APIRouter, Request

from backend.app.schemas.api import ModelStatusResponse, ModelsResponse

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelsResponse)
def list_models(request: Request) -> ModelsResponse:
    return ModelsResponse(models=request.app.state.runtime.models.statuses())


@router.get("/{model_id}/status", response_model=ModelStatusResponse)
def model_status(model_id: str, request: Request) -> ModelStatusResponse:
    return ModelStatusResponse(**request.app.state.runtime.models.status(model_id))
