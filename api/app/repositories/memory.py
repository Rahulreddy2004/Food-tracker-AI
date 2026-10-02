"""In-memory repositories: same behaviour as Firestore, no persistence. Used by tests and demos."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Any

from app.schemas.coach import ChatMessage
from app.schemas.meals import Meal
from app.schemas.pantry import PantryFood
from app.schemas.profile import Profile


class MemoryProfiles:
    def __init__(self) -> None:
        self.data: dict[str, Profile] = {}

    async def get(self, uid: str) -> Profile | None:
        found = self.data.get(uid)
        return found.model_copy(deep=True) if found else None

    async def put(self, uid: str, profile: Profile) -> Profile:
        self.data[uid] = profile.model_copy(deep=True)
        return profile


class MemoryMeals:
    def __init__(self) -> None:
        self.data: defaultdict[str, dict[str, Meal]] = defaultdict(dict)

    async def list_range(self, uid: str, start: dt.date, end: dt.date) -> list[Meal]:
        meals = [m for m in self.data[uid].values() if start <= m.local_date <= end]
        meals.sort(key=lambda m: (m.local_date, m.eaten_at))
        return [m.model_copy(deep=True) for m in meals]

    async def get(self, uid: str, meal_id: str) -> Meal | None:
        found = self.data[uid].get(meal_id)
        return found.model_copy(deep=True) if found else None

    async def put(self, uid: str, meal: Meal) -> Meal:
        self.data[uid][meal.id] = meal.model_copy(deep=True)
        return meal

    async def delete(self, uid: str, meal_id: str) -> bool:
        return self.data[uid].pop(meal_id, None) is not None


class MemoryPantry:
    def __init__(self) -> None:
        self.data: defaultdict[str, dict[str, PantryFood]] = defaultdict(dict)

    async def list(self, uid: str) -> list[PantryFood]:
        foods = sorted(self.data[uid].values(), key=lambda f: f.name.lower())
        return [f.model_copy(deep=True) for f in foods]

    async def get(self, uid: str, food_id: str) -> PantryFood | None:
        found = self.data[uid].get(food_id)
        return found.model_copy(deep=True) if found else None

    async def put(self, uid: str, food: PantryFood) -> PantryFood:
        self.data[uid][food.id] = food.model_copy(deep=True)
        return food

    async def delete(self, uid: str, food_id: str) -> bool:
        return self.data[uid].pop(food_id, None) is not None


class MemoryCoach:
    def __init__(self) -> None:
        self.data: defaultdict[str, list[ChatMessage]] = defaultdict(list)

    async def recent(self, uid: str, limit: int) -> list[ChatMessage]:
        return [m.model_copy() for m in self.data[uid][-limit:]]

    async def append(self, uid: str, message: ChatMessage) -> None:
        self.data[uid].append(message.model_copy())

    async def clear(self, uid: str) -> None:
        self.data.pop(uid, None)


class MemoryAccount:
    def __init__(self, repos: MemoryRepositories) -> None:
        self.repos = repos

    async def export(self, uid: str) -> dict[str, Any]:
        profile = await self.repos.profiles.get(uid)
        return {
            "profile": profile.model_dump(mode="json", by_alias=True) if profile else None,
            "meals": [
                m.model_dump(mode="json", by_alias=True)
                for m in self.repos.meals.data[uid].values()
            ],
            "pantry": [
                f.model_dump(mode="json", by_alias=True)
                for f in self.repos.pantry.data[uid].values()
            ],
            "coachMessages": [
                m.model_dump(mode="json", by_alias=True) for m in self.repos.coach.data[uid]
            ],
        }

    async def delete_all(self, uid: str) -> None:
        self.repos.profiles.data.pop(uid, None)
        self.repos.meals.data.pop(uid, None)
        self.repos.pantry.data.pop(uid, None)
        self.repos.coach.data.pop(uid, None)


class MemoryRepositories:
    def __init__(self) -> None:
        self.profiles = MemoryProfiles()
        self.meals = MemoryMeals()
        self.pantry = MemoryPantry()
        self.coach = MemoryCoach()
        self.account = MemoryAccount(self)
