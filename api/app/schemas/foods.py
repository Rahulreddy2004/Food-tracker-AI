from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel, Macros


class FoodHit(ApiModel):
    source: Literal["dish", "pantry", "calorieninjas"]
    id: str | None = Field(default=None, description="Pantry food id when source is `pantry`")
    name: str = Field(description="Stable key, e.g. a dish name such as `palak_paneer`")
    display: str
    group: str | None = None
    per100g: Macros = Field(alias="per100g")
    serving_g: float = Field(gt=0)
    serving_label: str | None = None


class FoodSearchResponse(ApiModel):
    query: str
    results: list[FoodHit]


class Product(ApiModel):
    code: str
    name: str
    brand: str | None = None
    image_url: str | None = None
    group: str
    serving_g: float | None = None
    serving_label: str | None = None
    per100g: Macros = Field(alias="per100g")
    per_serving: Macros | None = None
    nutri_score: Literal["a", "b", "c", "d", "e"] | None = None
    nova_group: int | None = Field(default=None, ge=1, le=4)
