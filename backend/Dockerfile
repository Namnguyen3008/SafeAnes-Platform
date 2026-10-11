FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    SAFEANES_ENV=production \
    SAFEANES_APP_MODE=VITALDB_REPLAY \
    SAFEANES_LOG_LEVEL=INFO \
    SAFEANES_DATA_ROOT=/app/data \
    SAFEANES_MODEL_ROOT=/models \
    MODEL_REGISTRY_PATH=/app/backend/app/ml/registry/model_registry.json \
    UC04_MODEL_PATH=/models/safeanes_uc04_model/model.pt \
    UC05_MODEL_PATH=/models/safeanes_uc05_respformer_v1/respformer.pt \
    SAFEANES_RUNTIME_DEVICE=cpu \
    PYTHONPATH=/app

WORKDIR /app

COPY backend/requirements-api.txt /tmp/requirements-api.txt
COPY backend/requirements-ml.txt /tmp/requirements-ml.txt

# CPU wheels only; GPU/CUDA execution is not part of the verified runtime.
RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==2.14.1+cpu" \
    && python -m pip install --no-cache-dir -r /tmp/requirements-api.txt -r /tmp/requirements-ml.txt \
    && groupadd --system --gid 10001 safeanes \
    && useradd --system --uid 10001 --gid safeanes --create-home safeanes

COPY backend/__init__.py /app/backend/__init__.py
COPY backend/app /app/backend/app
COPY backend/logging.json /app/backend/logging.json
COPY scripts /app/scripts

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live', timeout=3)"

# Replay sessions are process-local; keep one worker per instance.
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-config", "backend/logging.json", "--no-access-log"]
