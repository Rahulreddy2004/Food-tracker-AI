from __future__ import annotations

import datetime as dt
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator

from app.schemas.common import ApiModel

Goal = Literal["lose", "maintain", "gain", "health"]
Activity = Literal["sedentary", "light", "moderate", "active", "very_active"]


class Targets(ApiModel):
    kcal: float = Field(ge=800, le=10000)
    protein_g: float = Field(ge=0, le=500)
    fat_g: float = Field(ge=0, le=400)
    carbs_g: float = Field(ge=0, le=1500)


class Body(ApiModel):
    sex: Literal["female", "male"] | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    height_cm: float | None = Field(default=None, ge=80, le=260)
    weight_kg: float | None = Field(default=None, ge=20, le=400)
    activity: Activity | None = None


class ProfileIn(ApiModel):
    display_name: str | None = Field(default=None, max_length=60)
    goal: Goal = "health"
    targets: Targets
    body: Body | None = None
    units: Literal["metric", "imperial"] = "metric"
    timezone: str = "UTC"
    onboarded: bool = False

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"Unknown timezone: {value}") from None
        return value


class Profile(ProfileIn):
    created_at: dt.datetime | None = None
    updated_at: dt.datetime | None = None


DEFAULT_TARGETS = Targets(kcal=2000, protein_g=100, fat_g=67, carbs_g=250)


def default_profile() -> Profile:
    return Profile(targets=DEFAULT_TARGETS)
