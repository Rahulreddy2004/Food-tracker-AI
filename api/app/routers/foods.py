from __future__ import annotations

from fastapi import APIRouter, Path, Query

from app.core.ratelimit import SearchUser
from app.core.security import CurrentUser
from app.routers.deps import Deps
from app.schemas.foods import FoodSearchResponse, Product

router = APIRouter(tags=["foods"])


@router.get("/foods/search", response_model=FoodSearchResponse, summary="Search foods by name")
async def search_foods(
    deps: Deps,
    user: SearchUser,
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=12, ge=1, le=30),
) -> FoodSearchResponse:
    pantry = await deps.repos.pantry.list(user.uid)
    results = await deps.search.search(q.strip(), pantry, limit=limit)
    return FoodSearchResponse(query=q, results=results)


@router.get("/barcode/{code}", response_model=Product, summary="Look up a packaged food")
async def barcode(
    deps: Deps, user: CurrentUser, code: str = Path(min_length=8, max_length=14)
) -> Product:
    return await deps.barcode.lookup(code)
