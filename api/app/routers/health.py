from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.routers.deps import Deps
from app.schemas.common import ApiModel

router = APIRouter(prefix="/health", tags=["health"])


class Health(ApiModel):
    status: str
    models: bool
    coach: bool
    detail: str | None = None


@router.get("/live", response_model=Health)
async def live() -> Health:
    return Health(status="ok", models=True, coach=True)


@router.get("/ready", response_model=Health, responses={503: {"model": Health}})
async def ready(deps: Deps) -> Health | JSONResponse:
    health = Health(
        status="ok" if deps.scan.ready else "starting",
        models=deps.scan.ready,
        coach=deps.coach is not None,
        detail=deps.scan.unavailable_reason,
    )
    if not deps.scan.ready:
        return JSONResponse(health.model_dump(by_alias=True), status_code=503)
    return health
