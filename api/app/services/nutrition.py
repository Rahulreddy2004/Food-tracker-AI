"""Nutrition data: bundled Food-101 table, CalorieNinjas for free text, and unified search."""

from __future__ import annotations

import difflib
import json
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import structlog
from cachetools import TTLCache

from app.ml.labels import LabelSet
from app.schemas.common import Macros
from app.schemas.foods import FoodHit
from app.schemas.pantry import PantryFood

log = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class NutritionEntry:
    per100g: Macros
    serving_g: float


class NutritionTable:
    def __init__(self, entries: dict[str, NutritionEntry], source: str) -> None:
        self.entries = entries
        self.source = source

    @classmethod
    def load(cls, path: Path) -> NutritionTable:
        raw = json.loads(path.read_text(encoding="utf-8"))
        entries = {
            name: NutritionEntry(
                per100g=Macros(
                    kcal=v["kcal"], protein_g=v["proteinG"], fat_g=v["fatG"], carbs_g=v["carbsG"]
                ),
                serving_g=float(v["servingG"]),
            )
            for name, v in raw["items"].items()
        }
        return cls(entries, raw.get("source", "unknown"))

    def get(self, name: str) -> NutritionEntry | None:
        return self.entries.get(name)


def _number(value: Any) -> float | None:
    """CalorieNinjas returns a text notice instead of a number for some fields on free plans."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


class CalorieNinjasClient:
    URL = "https://api.calorieninjas.com/v1/nutrition"

    def __init__(self, http: httpx.AsyncClient, api_key: str | None) -> None:
        self.http = http
        self.api_key = api_key
        self._cache: TTLCache[str, list[FoodHit]] = TTLCache(maxsize=2048, ttl=7 * 24 * 3600)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def search(self, query: str) -> list[FoodHit]:
        if not self.api_key:
            return []
        key = normalize(query)
        if key in self._cache:
            return self._cache[key]
        try:
            response = await self.http.get(
                self.URL, params={"query": query}, headers={"X-Api-Key": self.api_key}
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("calorieninjas_failed", error=type(exc).__name__)
            return []

        hits: list[FoodHit] = []
        for item in payload.get("items", []):
            serving = _number(item.get("serving_size_g")) or 100.0
            kcal = _number(item.get("calories"))
            if kcal is None or serving <= 0:
                continue
            factor = 100.0 / serving
            name = str(item.get("name", query)).strip() or query
            hits.append(
                FoodHit(
                    source="calorieninjas",
                    name=name,
                    display=name[:1].upper() + name[1:],
                    per100g=Macros(
                        kcal=round(kcal * factor, 1),
                        protein_g=round((_number(item.get("protein_g")) or 0) * factor, 1),
                        fat_g=round((_number(item.get("fat_total_g")) or 0) * factor, 1),
                        carbs_g=round(
                            (_number(item.get("carbohydrates_total_g")) or 0) * factor, 1
                        ),
                    ),
                    serving_g=round(serving, 1),
                )
            )
        self._cache[key] = hits
        return hits


def normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(folded.lower().replace("_", " ").split())


def match_score(query: str, candidate: str) -> float:
    q, c = normalize(query), normalize(candidate)
    if not q or not c:
        return 0.0
    if q == c:
        return 1.0
    if c.startswith(q):
        return 0.92
    words = c.split()
    if any(w.startswith(q) for w in words):
        return 0.85
    if q in c:
        return 0.75
    q_words = q.split()
    if q_words and all(any(w.startswith(qw) for w in words) for qw in q_words):
        return 0.7
    ratio = difflib.SequenceMatcher(None, q, c).ratio()
    return ratio * 0.65 if ratio >= 0.6 else 0.0


class FoodSearch:
    """Search order: Food-101 dishes, the user's pantry, then CalorieNinjas when few local hits."""

    MIN_SCORE = 0.38

    def __init__(
        self, labels: LabelSet, table: NutritionTable, calorie: CalorieNinjasClient
    ) -> None:
        self.labels = labels
        self.table = table
        self.calorie = calorie

    def food101_hits(self, query: str) -> list[tuple[float, FoodHit]]:
        scored: list[tuple[float, FoodHit]] = []
        for food in self.labels.classes:
            entry = self.table.get(food.name)
            if entry is None:
                continue
            score = max(match_score(query, food.display), match_score(query, food.name))
            if score >= self.MIN_SCORE:
                scored.append(
                    (
                        score,
                        FoodHit(
                            source="food101",
                            name=food.name,
                            display=food.display,
                            group=food.group,
                            per100g=entry.per100g,
                            serving_g=entry.serving_g,
                        ),
                    )
                )
        return scored

    @staticmethod
    def pantry_hits(query: str, pantry: list[PantryFood]) -> list[tuple[float, FoodHit]]:
        scored: list[tuple[float, FoodHit]] = []
        for food in pantry:
            score = match_score(query, food.name)
            if score >= FoodSearch.MIN_SCORE:
                scored.append(
                    (
                        score + 0.05,  # your own foods win ties
                        FoodHit(
                            source="pantry",
                            id=food.id,
                            name=food.name,
                            display=food.name,
                            group="My pantry",
                            per100g=food.per100g,
                            serving_g=food.serving_g,
                            serving_label=food.serving_label,
                        ),
                    )
                )
        return scored

    async def search(self, query: str, pantry: list[PantryFood], limit: int = 12) -> list[FoodHit]:
        scored = self.food101_hits(query) + self.pantry_hits(query, pantry)
        scored.sort(key=lambda pair: pair[0], reverse=True)
        hits = [hit for _, hit in scored[:limit]]
        strong_local = sum(1 for score, _ in scored if score >= 0.75)
        if strong_local < 3 and len(normalize(query)) >= 3:
            seen = {normalize(h.name) for h in hits}
            for hit in await self.calorie.search(query):
                if normalize(hit.name) not in seen and len(hits) < limit:
                    hits.append(hit)
                    seen.add(normalize(hit.name))
        return hits
