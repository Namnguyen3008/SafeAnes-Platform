from __future__ import annotations

from contextlib import asynccontextmanager
import hmac
import logging
import re
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.app.api.routes import cases, health, models, replay
from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError
from backend.app.core.logging_config import configure_logging
from backend.app.repositories.case_repository import CaseRepository
from backend.app.repositories.vitaldb_repository import VitalDBRepository
from backend.app.schemas.api import ErrorResponse
from backend.app.services.cases.service import CaseService
from backend.app.services.inference.model_manager import ModelManager
from backend.app.services.inference.uc04_batch import UC04OfflineBatchService
from backend.app.services.inference.uc05_batch import UC05OfflineBatchService
from backend.app.services.replay.manager import ReplayManager
from backend.app.services.replay.stream import ReplayStreamService
from backend.app.services.signals.service import SignalService
from backend.app.services.signals.uc04_view import UC04VitalDBViewService
from backend.app.services.signals.uc05_view import UC05VitalDBViewService


logger = logging.getLogger("safeanes.api")
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class BackendRuntime:
    """Application-scoped services, model instances, and local repositories."""

    def __init__(
        self,
        *,
        settings: Settings,
        load_models: bool = True,
        vitaldb_module=None,
    ) -> None:
        self.settings = settings
        self.cases = CaseRepository(settings)
        self.vitaldb = VitalDBRepository(settings, self.cases, vitaldb_module=vitaldb_module)
        self.case_service = CaseService(self.cases)
        self.signal_service = SignalService(settings, self.cases, self.vitaldb)
        self.models = ModelManager(settings, self.vitaldb, load_models=load_models)
        self.uc04_batch = UC04OfflineBatchService(settings, self.cases, self.models)
        self.uc05_batch = UC05OfflineBatchService(settings, self.cases, self.models)
        self.uc04_view = UC04VitalDBViewService(
            settings, self.cases, self.vitaldb, self.signal_service, self.uc04_batch.cache, self.models
        )
        self.uc05_view = UC05VitalDBViewService(
            settings, self.cases, self.vitaldb, self.signal_service,
            self.uc05_batch.cache, self.models,
        )
        self.replay = ReplayManager()
        self.replay_stream = ReplayStreamService(
            settings,
            self.cases,
            self.signal_service,
            self.uc04_view,
            self.uc05_view,
            self.uc04_batch.cache,
            self.uc05_batch.cache,
        )

    def initialize(self) -> None:
        self.models.initialize()

    def close(self) -> None:
        self.replay.close()
        self.models.close()


def create_app(
    *,
    settings: Settings | None = None,
    runtime: BackendRuntime | None = None,
) -> FastAPI:
    configured = settings or Settings.from_env()
    configure_logging(configured.log_level)
    backend_runtime = runtime or BackendRuntime(settings=configured)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("SafeAnes backend startup", extra={"application_mode": configured.application_mode})
        backend_runtime.initialize()
        try:
            yield
        finally:
            close = getattr(backend_runtime, "close", None)
            if callable(close):
                close()
            logger.info("SafeAnes backend shutdown")

    app = FastAPI(
        title="SafeAnes Backend API",
        version="1.0.0",
        description=(
            "Local API for VitalDB case discovery, observed signals, verified model inference, "
            "and replay. Time values are elapsed seconds from the beginning of the case. "
            "Model outputs are returned only when the audited model contract permits inference."
        ),
        docs_url=None if configured.environment == "production" else "/docs",
        redoc_url=None if configured.environment == "production" else "/redoc",
        openapi_url=None if configured.environment == "production" else "/openapi.json",
        lifespan=lifespan,
    )
    app.state.runtime = backend_runtime
    if configured.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(configured.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Accept", "Content-Type", "Authorization", "X-Request-ID"],
        )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(configured.allowed_hosts))

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        supplied_request_id = request.headers.get("X-Request-ID", "")
        request_id = supplied_request_id if _REQUEST_ID_PATTERN.fullmatch(supplied_request_id) else str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        path = request.url.path
        protected_api = path.startswith("/api/v1/") and path not in {
            "/api/v1/health/live",
            "/api/v1/health/ready",
        }
        if configured.api_token and protected_api and request.method != "OPTIONS":
            authorization = request.headers.get("Authorization", "")
            scheme, _, supplied_token = authorization.partition(" ")
            if (
                scheme.lower() != "bearer"
                or not supplied_token.isascii()
                or not hmac.compare_digest(supplied_token.encode("ascii"), configured.api_token.encode("utf-8"))
            ):
                response = JSONResponse(
                    status_code=401,
                    content={"error": {"code": "UNAUTHORIZED", "message": "A valid bearer token is required",
                                        "request_id": request_id, "details": {}}},
                )
                response.headers["X-Request-ID"] = request_id
                return response
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request failed", extra={"request_id": request_id, "path": path})
            raise
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request complete",
            extra={"request_id": request_id, "method": request.method, "path": path,
                   "status_code": response.status_code, "duration_ms": round(elapsed_ms, 2)},
        )
        return response

    @app.exception_handler(ApiServiceError)
    async def service_error_handler(request: Request, exc: ApiServiceError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message,
                                "request_id": getattr(request.state, "request_id", None),
                                "details": exc.details}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        problems = [
            {"location": list(error.get("loc", ())), "message": str(error.get("msg", "Invalid value"))}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "INVALID_REQUEST", "message": "Request parameters failed validation",
                                "request_id": getattr(request.state, "request_id", None),
                                "details": {"problems": problems}}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        code = "ROUTE_NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        message = "API route was not found" if exc.status_code == 404 else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": message,
                                "request_id": getattr(request.state, "request_id", None), "details": {}}},
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception):
        logger.exception("unhandled API error", extra={"request_id": getattr(request.state, "request_id", None)})
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "The request could not be completed",
                                "request_id": getattr(request.state, "request_id", None), "details": {}}},
        )

    for route_module in (health, models, cases, replay):
        app.include_router(route_module.router, prefix="/api/v1")

    def openapi_with_error_contract():
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        error_schema = ErrorResponse.model_json_schema(
            ref_template="#/components/schemas/{model}"
        )
        definitions = error_schema.pop("$defs", {})
        components.update(definitions)
        components["ErrorResponse"] = error_schema
        for path_item in schema.get("paths", {}).values():
            for operation in path_item.values():
                if not isinstance(operation, dict) or "responses" not in operation:
                    continue
                responses = operation["responses"]
                responses["422"] = {
                    "description": "Structured request or input validation error",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}},
                }
                for code, description in (
                    ("404", "Requested case, track, session, or model was not found"),
                    ("500", "Inference or internal processing failed"),
                    ("503", "Local cache or model runtime is not ready"),
                ):
                    responses.setdefault(code, {
                        "description": description,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}},
                    })
        app.openapi_schema = schema
        return schema

    app.openapi = openapi_with_error_contract
    return app


app = create_app()
