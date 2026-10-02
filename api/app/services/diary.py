"""Diary rules: nutrition is always recomputed on the server from per-100 g values × grams."""

from __future__ import annotations

import datetime as dt
import uuid

from app.core.errors import ApiError
from app.schemas.common import Macros
from app.schemas.meals import (
    DailySummary,
    DaySummary,
    Meal,
    MealIn,
    MealItem,
    MealItemIn,
    MealPatch,
)
from app.schemas.pantry import PantryFood, PantryIn, PantryPatch

MAX_RANGE_DAYS = 400


def build_items(items: list[MealItemIn]) -> list[MealItem]:
    return [
        MealItem(**item.model_dump(), nutrition=item.per100g.for_grams(item.grams))
        for item in items
    ]


def totals_of(items: list[MealItem]) -> Macros:
    total = Macros.zero()
    for item in items:
        total = total + item.nutrition
    return total


def check_photo_path(uid: str, path: str | None) -> None:
    if path is not None and (not path.startswith(f"users/{uid}/") or ".." in path):
        raise ApiError(422, "invalid_photo_path", "Photo path must be inside your own folder")


def new_meal(uid: str, data: MealIn, now: dt.datetime | None = None) -> Meal:
    now = now or dt.datetime.now(dt.UTC)
    check_photo_path(uid, data.photo_path)
    items = build_items(data.items)
    return Meal(
        id=uuid.uuid4().hex,
        local_date=data.local_date,
        meal_type=data.meal_type,
        eaten_at=data.eaten_at or now,
        source=data.source,
        items=items,
        totals=totals_of(items),
        photo_path=data.photo_path,
        note=data.note,
        created_at=now,
        updated_at=now,
    )


def patched_meal(uid: str, meal: Meal, patch: MealPatch) -> Meal:
    changes = patch.model_dump(exclude_unset=True)
    if "photo_path" in changes:
        check_photo_path(uid, patch.photo_path)
    if patch.items is not None:
        items = build_items(patch.items)
        changes["items"] = items
        changes["totals"] = totals_of(items)
    changes["updated_at"] = dt.datetime.now(dt.UTC)
    return meal.model_copy(update=changes)


def check_range(start: dt.date, end: dt.date) -> None:
    if end < start:
        raise ApiError(422, "invalid_range", "`to` must be on or after `from`")
    if (end - start).days > MAX_RANGE_DAYS:
        raise ApiError(422, "invalid_range", f"Ranges are limited to {MAX_RANGE_DAYS} days")


def summarize(meals: list[Meal], start: dt.date, end: dt.date) -> DailySummary:
    by_day: dict[dt.date, list[Meal]] = {}
    for meal in meals:
        by_day.setdefault(meal.local_date, []).append(meal)
    days: list[DaySummary] = []
    day = start
    while day <= end:
        day_meals = by_day.get(day, [])
        total = Macros.zero()
        for meal in day_meals:
            total = total + meal.totals
        days.append(DaySummary(date=day, totals=total, meals=len(day_meals)))
        day += dt.timedelta(days=1)
    return DailySummary(days=days)


def per100g_of(per_serving: Macros, serving_g: float) -> Macros:
    return per_serving.scaled(100.0 / serving_g)


def new_pantry_food(data: PantryIn, now: dt.datetime | None = None) -> PantryFood:
    now = now or dt.datetime.now(dt.UTC)
    return PantryFood(
        **data.model_dump(),
        id=uuid.uuid4().hex,
        per100g=per100g_of(data.per_serving, data.serving_g),
        created_at=now,
        updated_at=now,
    )


def patched_pantry_food(food: PantryFood, patch: PantryPatch) -> PantryFood:
    changes = patch.model_dump(exclude_unset=True)
    updated = food.model_copy(update=changes)
    return updated.model_copy(
        update={
            "per100g": per100g_of(updated.per_serving, updated.serving_g),
            "updated_at": dt.datetime.now(dt.UTC),
        }
    )
