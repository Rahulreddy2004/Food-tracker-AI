from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from app.core.security import CurrentUser
from app.routers.deps import Deps
from app.schemas.profile import Profile, ProfileIn, default_profile

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/profile", response_model=Profile, summary="Your goals and settings")
async def get_profile(deps: Deps, user: CurrentUser) -> Profile:
    profile = await deps.repos.profiles.get(user.uid)
    if profile is None:
        profile = default_profile()
        if user.name:
            profile.display_name = user.name[:60]
    return profile


@router.put("/profile", response_model=Profile)
async def put_profile(deps: Deps, user: CurrentUser, body: ProfileIn) -> Profile:
    existing = await deps.repos.profiles.get(user.uid)
    now = dt.datetime.now(dt.UTC)
    profile = Profile(
        **body.model_dump(),
        created_at=existing.created_at if existing and existing.created_at else now,
        updated_at=now,
    )
    return await deps.repos.profiles.put(user.uid, profile)


@router.get("/export", summary="Download all of your data as JSON")
async def export_data(deps: Deps, user: CurrentUser) -> JSONResponse:
    data = await deps.account.export(user.uid)
    filename = f"food-tracker-export-{dt.date.today().isoformat()}.json"
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.delete("", status_code=204, response_class=Response, summary="Delete your account")
async def delete_account(deps: Deps, user: CurrentUser) -> Response:
    await deps.account.delete(user.uid)
    return Response(status_code=204)
