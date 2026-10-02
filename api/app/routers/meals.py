from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Query, Response

from app.core.errors import not_found
from app.core.security import CurrentUser
from app.routers.deps import Deps
from app.schemas.meals import DailySummary, Meal, MealIn, MealList, MealPatch
from app.services import diary

router = APIRouter(tags=["meals"])

FromDate = Query(alias="from", description="First day (inclusive), YYYY-MM-DD")
ToDate = Query(alias="to", description="Last day (inclusive), YYYY-MM-DD")


@router.get("/meals", response_model=MealList, summary="Meals in a date range")
async def list_meals(
    deps: Deps, user: CurrentUser, start: dt.date = FromDate, end: dt.date = ToDate
) -> MealList:
    diary.check_range(start, end)
    return MealList(meals=await deps.repos.meals.list_range(user.uid, start, end))


@router.post("/meals", response_model=Meal, status_code=201, summary="Log a meal")
async def create_meal(deps: Deps, user: CurrentUser, body: MealIn) -> Meal:
    meal = diary.new_meal(user.uid, body)
    return await deps.repos.meals.put(user.uid, meal)


@router.get("/meals/{meal_id}", response_model=Meal)
async def get_meal(deps: Deps, user: CurrentUser, meal_id: str) -> Meal:
    meal = await deps.repos.meals.get(user.uid, meal_id)
    if meal is None:
        raise not_found("Meal")
    return meal


@router.patch("/meals/{meal_id}", response_model=Meal, summary="Edit a meal")
async def update_meal(deps: Deps, user: CurrentUser, meal_id: str, body: MealPatch) -> Meal:
    meal = await deps.repos.meals.get(user.uid, meal_id)
    if meal is None:
        raise not_found("Meal")
    return await deps.repos.meals.put(user.uid, diary.patched_meal(user.uid, meal, body))


@router.delete("/meals/{meal_id}", status_code=204, response_class=Response)
async def delete_meal(deps: Deps, user: CurrentUser, meal_id: str) -> Response:
    if not await deps.repos.meals.delete(user.uid, meal_id):
        raise not_found("Meal")
    return Response(status_code=204)


@router.get("/summary/daily", response_model=DailySummary, summary="Totals per day")
async def daily_summary(
    deps: Deps, user: CurrentUser, start: dt.date = FromDate, end: dt.date = ToDate
) -> DailySummary:
    diary.check_range(start, end)
    meals = await deps.repos.meals.list_range(user.uid, start, end)
    return diary.summarize(meals, start, end)
