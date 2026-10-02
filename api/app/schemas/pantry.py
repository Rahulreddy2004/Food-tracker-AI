from __future__ import annotations

import datetime as dt

from pydantic import Field, model_validator

from app.schemas.common import ApiModel, Macros


class PantryIn(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    serving_g: float = Field(default=100, gt=0, le=3000)
    serving_label: str | None = Field(default=None, max_length=40)
    per_serving: Macros
    favorite: bool = False


class PantryPatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    serving_g: float | None = Field(default=None, gt=0, le=3000)
    serving_label: str | None = Field(default=None, max_length=40)
    per_serving: Macros | None = None
    favorite: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> PantryPatch:
        if not self.model_fields_set:
            raise ValueError("Nothing to update")
        return self


class PantryFood(PantryIn):
    id: str
    per100g: Macros = Field(alias="per100g")
    created_at: dt.datetime
    updated_at: dt.datetime
    last_used_at: dt.datetime | None = None


class PantryList(ApiModel):
    foods: list[PantryFood]
