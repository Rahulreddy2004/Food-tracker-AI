from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.errors import not_found
from app.core.security import CurrentUser
from app.routers.deps import Deps
from app.schemas.pantry import PantryFood, PantryIn, PantryList, PantryPatch
from app.services import diary

router = APIRouter(prefix="/pantry", tags=["pantry"])


@router.get("", response_model=PantryList, summary="Your custom foods")
async def list_pantry(deps: Deps, user: CurrentUser) -> PantryList:
    return PantryList(foods=await deps.repos.pantry.list(user.uid))


@router.post("", response_model=PantryFood, status_code=201)
async def create_pantry_food(deps: Deps, user: CurrentUser, body: PantryIn) -> PantryFood:
    return await deps.repos.pantry.put(user.uid, diary.new_pantry_food(body))


@router.patch("/{food_id}", response_model=PantryFood)
async def update_pantry_food(
    deps: Deps, user: CurrentUser, food_id: str, body: PantryPatch
) -> PantryFood:
    food = await deps.repos.pantry.get(user.uid, food_id)
    if food is None:
        raise not_found("Food")
    return await deps.repos.pantry.put(user.uid, diary.patched_pantry_food(food, body))


@router.delete("/{food_id}", status_code=204, response_class=Response)
async def delete_pantry_food(deps: Deps, user: CurrentUser, food_id: str) -> Response:
    if not await deps.repos.pantry.delete(user.uid, food_id):
        raise not_found("Food")
    return Response(status_code=204)
