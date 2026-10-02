# syntax=docker/dockerfile:1.7
# Food Tracker API — slim runtime: FastAPI + ONNX Runtime (no TensorFlow / PyTorch).
# Build context: api/. The ONNX files must be in api/models (scripts/fetch_models.py does that).

# Override to build on a mirror or a base with a corporate CA (see README).
ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

FROM base AS build
# uv from PyPI (pinned) rather than its ghcr.io image, so the build only needs Docker Hub + PyPI.
RUN pip install --no-cache-dir uv==0.8.17
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project
COPY app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM base AS runtime
RUN useradd --create-home --uid 10001 api
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
# Whatever fetch_models.py put in api/models (originals and partial downloads are excluded).
COPY models/ /app/models/
ENV PATH="/app/.venv/bin:${PATH}" \
    ENV=production \
    LOG_JSON=true \
    MODELS_DIR=/app/models \
    PORT=8080
USER api
EXPOSE 8080
# One worker per instance: the models are loaded once and ONNX Runtime uses the CPUs itself.
# Access logs come from the app (JSON, with uid + request id), so uvicorn's are off.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*' --timeout-graceful-shutdown 10 --no-server-header --no-access-log"]
