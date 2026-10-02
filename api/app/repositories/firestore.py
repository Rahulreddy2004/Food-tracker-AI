"""Firestore repositories.

Layout (all under the signed-in user, so security rules and deletion are simple):
  users/{uid}                       profile
  users/{uid}/meals/{mealId}        meals (localDate is an ISO string → range queries work)
  users/{uid}/pantry/{foodId}       custom foods
  users/{uid}/coachMessages/{id}    coach conversation
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from firebase_admin import firestore_async
from google.cloud.firestore_v1 import FieldFilter, Query
from google.cloud.firestore_v1.async_client import AsyncClient
from pydantic import BaseModel

from app.core.firebase import get_firebase_app
from app.schemas.coach import ChatMessage
from app.schemas.meals import Meal
from app.schemas.pantry import PantryFood
from app.schemas.profile import Profile

SCHEMA_VERSION = 2
_INTERNAL_KEYS = {"schemaVersion"}


def _jsonable_dates(value: Any) -> Any:
    """Firestore stores datetimes natively but not plain dates: store dates as ISO strings."""
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable_dates(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable_dates(v) for v in value]
    return value


def to_doc(model: BaseModel, exclude: set[str] | None = None) -> dict[str, Any]:
    data = model.model_dump(by_alias=True, mode="python", exclude=exclude, exclude_none=True)
    data = _jsonable_dates(data)
    data["schemaVersion"] = SCHEMA_VERSION
    return data  # type: ignore[no-any-return]


def from_doc[M: BaseModel](cls: type[M], data: dict[str, Any], **extra: Any) -> M:
    clean = {k: v for k, v in data.items() if k not in _INTERNAL_KEYS}
    clean.update(extra)
    return cls.model_validate(clean)


class FirestoreRepositories:
    def __init__(self, client: AsyncClient | None = None) -> None:
        self.db = client or firestore_async.client(app=get_firebase_app())
        self.profiles = _Profiles(self.db)
        self.meals = _Meals(self.db)
        self.pantry = _Pantry(self.db)
        self.coach = _Coach(self.db)
        self.account = _Account(self)

    def user(self, uid: str) -> Any:
        return self.db.collection("users").document(uid)


class _Base:
    def __init__(self, db: AsyncClient) -> None:
        self.db = db

    def user(self, uid: str) -> Any:
        return self.db.collection("users").document(uid)


class _Profiles(_Base):
    async def get(self, uid: str) -> Profile | None:
        snap = await self.user(uid).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        if "targets" not in data:  # a users/{uid} doc can exist before a profile is saved
            return None
        return from_doc(Profile, data)

    async def put(self, uid: str, profile: Profile) -> Profile:
        await self.user(uid).set(to_doc(profile), merge=False)
        return profile


class _Meals(_Base):
    def col(self, uid: str) -> Any:
        return self.user(uid).collection("meals")

    async def list_range(self, uid: str, start: dt.date, end: dt.date) -> list[Meal]:
        query = (
            self.col(uid)
            .where(filter=FieldFilter("localDate", ">=", start.isoformat()))
            .where(filter=FieldFilter("localDate", "<=", end.isoformat()))
            .order_by("localDate")
        )
        meals = [from_doc(Meal, snap.to_dict(), id=snap.id) async for snap in query.stream()]
        meals.sort(key=lambda m: (m.local_date, m.eaten_at))
        return meals

    async def get(self, uid: str, meal_id: str) -> Meal | None:
        snap = await self.col(uid).document(meal_id).get()
        return from_doc(Meal, snap.to_dict(), id=snap.id) if snap.exists else None

    async def put(self, uid: str, meal: Meal) -> Meal:
        await self.col(uid).document(meal.id).set(to_doc(meal, exclude={"id"}))
        return meal

    async def delete(self, uid: str, meal_id: str) -> bool:
        ref = self.col(uid).document(meal_id)
        if not (await ref.get()).exists:
            return False
        await ref.delete()
        return True


class _Pantry(_Base):
    def col(self, uid: str) -> Any:
        return self.user(uid).collection("pantry")

    async def list(self, uid: str) -> list[PantryFood]:
        foods = [from_doc(PantryFood, s.to_dict(), id=s.id) async for s in self.col(uid).stream()]
        return sorted(foods, key=lambda f: f.name.lower())

    async def get(self, uid: str, food_id: str) -> PantryFood | None:
        snap = await self.col(uid).document(food_id).get()
        return from_doc(PantryFood, snap.to_dict(), id=snap.id) if snap.exists else None

    async def put(self, uid: str, food: PantryFood) -> PantryFood:
        await self.col(uid).document(food.id).set(to_doc(food, exclude={"id"}))
        return food

    async def delete(self, uid: str, food_id: str) -> bool:
        ref = self.col(uid).document(food_id)
        if not (await ref.get()).exists:
            return False
        await ref.delete()
        return True


class _Coach(_Base):
    def col(self, uid: str) -> Any:
        return self.user(uid).collection("coachMessages")

    async def recent(self, uid: str, limit: int) -> list[ChatMessage]:
        query = self.col(uid).order_by("createdAt", direction=Query.DESCENDING).limit(limit)
        messages = [from_doc(ChatMessage, s.to_dict(), id=s.id) async for s in query.stream()]
        return list(reversed(messages))

    async def append(self, uid: str, message: ChatMessage) -> None:
        await self.col(uid).document(message.id).set(to_doc(message, exclude={"id"}))

    async def clear(self, uid: str) -> None:
        await self.db.recursive_delete(self.col(uid))


class _Account:
    def __init__(self, repos: FirestoreRepositories) -> None:
        self.repos = repos

    async def export(self, uid: str) -> dict[str, Any]:
        profile = await self.repos.profiles.get(uid)
        meals = [
            from_doc(Meal, s.to_dict(), id=s.id) async for s in self.repos.meals.col(uid).stream()
        ]
        pantry = await self.repos.pantry.list(uid)
        messages = [
            from_doc(ChatMessage, s.to_dict(), id=s.id)
            async for s in self.repos.coach.col(uid).order_by("createdAt").stream()
        ]
        return {
            "profile": profile.model_dump(mode="json", by_alias=True) if profile else None,
            "meals": [m.model_dump(mode="json", by_alias=True) for m in meals],
            "pantry": [f.model_dump(mode="json", by_alias=True) for f in pantry],
            "coachMessages": [m.model_dump(mode="json", by_alias=True) for m in messages],
        }

    async def delete_all(self, uid: str) -> None:
        await self.repos.db.recursive_delete(self.repos.user(uid))
