from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.core.errors import ApiError
from app.core.ratelimit import ScanUser
from app.routers.deps import Deps
from app.schemas.scan import ScanResponse

router = APIRouter(tags=["scan"])


@router.post(
    "/scan",
    response_model=ScanResponse,
    summary="Detect and recognise the foods in a photo",
)
async def scan(
    deps: Deps, user: ScanUser, image: UploadFile = File(description="JPEG, PNG, WebP or HEIC")
) -> ScanResponse:
    limit = deps.settings.max_upload_bytes
    data = await image.read(limit + 1)
    if len(data) > limit:
        raise ApiError(
            413,
            "image_too_large",
            "That photo is too large",
            f"Please use an image under {deps.settings.max_upload_mb:g} MB.",
        )
    if not data:
        raise ApiError(422, "empty_image", "The upload was empty")
    return await deps.scan.scan(data)
