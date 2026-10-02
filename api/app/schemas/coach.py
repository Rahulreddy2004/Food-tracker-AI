from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class CoachMessageIn(ApiModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatMessage(ApiModel):
    id: str
    role: Literal["user", "model"]
    text: str
    created_at: dt.datetime


class CoachThread(ApiModel):
    messages: list[ChatMessage]


class MealInsightIn(ApiModel):
    meal_id: str = Field(min_length=1, max_length=128)


class MealInsight(ApiModel):
    headline: str = Field(max_length=120)
    tip: str = Field(max_length=400)
    next_meal_suggestion: str = Field(max_length=300)
