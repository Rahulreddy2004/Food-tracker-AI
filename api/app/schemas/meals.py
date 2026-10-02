from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.schemas.common import ApiModel, Macros, NormBox

MealType = Literal["breakfast", "lunch", "dinner", "snack"]
MealSource = Literal["scan", "barcode", "pantry", "search", "manual"]


class MealItemIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    display: str = Field(min_length=1, max_length=120)
    group: str | None = Field(default=None, max_length=60)
    label: str | None = Field(default=None, max_length=80, description="Food-101 class if known")
    confidence: float | None = Field(default=None, ge=0, le=1)
    grams: float = Field(gt=0, le=5000)
    estimated_grams: float | None = Field(default=None, gt=0, le=5000)
    per100g: Macros = Field(alias="per100g")
    box: NormBox | None = None


class MealItem(MealItemIn):
    nutrition: Macros


class MealIn(ApiModel):
    local_date: dt.date = Field(description="Calendar day in the user's timezone")
    meal_type: MealType
    eaten_at: AwareDatetime | None = None
    source: MealSource
    items: list[MealItemIn] = Field(min_length=1, max_length=30)
    photo_path: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=500)


class MealPatch(ApiModel):
    local_date: dt.date | None = None
    meal_type: MealType | None = None
    items: list[MealItemIn] | None = Field(default=None, min_length=1, max_length=30)
    photo_path: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _not_empty(self) -> MealPatch:
        if not self.model_fields_set:
            raise ValueError("Nothing to update")
        return self


class Meal(ApiModel):
    id: str
    local_date: dt.date
    meal_type: MealType
    eaten_at: dt.datetime
    source: MealSource
    items: list[MealItem]
    totals: Macros
    photo_path: str | None = None
    note: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime


class MealList(ApiModel):
    meals: list[Meal]


class DaySummary(ApiModel):
    date: dt.date
    totals: Macros
    meals: int


class DailySummary(ApiModel):
    days: list[DaySummary]
