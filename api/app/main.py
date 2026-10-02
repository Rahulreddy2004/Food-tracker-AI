"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.container import Container, build_container
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.routers import coach, foods, health, me, meals, pantry, scan

API_DESCRIPTION = """
Food Tracker AI: photo → foods → nutrition.

* **Scan:** YOLOv8 finds the foods; EfficientNetV2-B3 (Food-101) names them; portions are estimated
  from box size.
* **Diary:** meals, daily summaries, pantry foods, goals.
* **Coach:** an AI nutrition coach grounded in your own data (streamed replies).

Authenticate with a Firebase ID token: `Authorization: Bearer <token>`.
"""


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.container = container or await build_container(settings)
        try:
            yield
        finally:
            await app.state.container.aclose()

    app = FastAPI(
        title="Food Tracker AI API",
        version="2.0.0",
        description=API_DESCRIPTION,
        lifespan=lifespan,
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
    )
    install_error_handlers(app)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=3600,
    )
    app.add_middleware(RequestContextMiddleware)

    v1 = APIRouter(prefix="/v1")
    for module in (health, scan, foods, meals, pantry, me, coach):
        v1.include_router(module.router)
    app.include_router(v1)
    return app


app = create_app()
