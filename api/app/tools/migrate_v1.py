"""Move v1 Firestore data into the v2 layout. Dry run by default; safe to run more than once.

v1 collections                         v2 destination
  user_profiles/{uid}                  users/{uid}                 (profile)
  user_meals/{uid}/meals/{id}          users/{uid}/meals/{id}      (same ids → idempotent)
  user_custom_foods/{uid}/foods/{id}   users/{uid}/pantry/{id}

    cd api && uv run python -m app.tools.migrate_v1 --timezone Asia/Kolkata          # preview
    cd api && uv run python -m app.tools.migrate_v1 --timezone Asia/Kolkata --apply  # write
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from collections import Counter
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from app.schemas.common import Macros
from app.schemas.meals import Meal, MealItem, MealType
from app.schemas.pantry import PantryFood
from app.schemas.profile import Profile, Targets

GOALS = {
    "weight loss": "lose",
    "maintenance": "maintain",
    "muscle gain": "gain",
    "general health": "health",
}
_GRAMS_RE = re.compile(r"Est\.\s*(\d+(?:\.\d+)?)\s*g", re.IGNORECASE)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number >= 0 else default


def targets_for(kcal: float) -> Targets:
    """20% protein / 30% fat / 50% carbs split, the same default the app uses."""
    kcal = min(max(kcal, 800.0), 10000.0)
    return Targets(
        kcal=round(kcal),
        protein_g=round(kcal * 0.20 / 4),
        fat_g=round(kcal * 0.30 / 9),
        carbs_g=round(kcal * 0.50 / 4),
    )


def map_profile(old: dict[str, Any], timezone: str, now: dt.datetime) -> Profile:
    goal = GOALS.get(str(old.get("goal", "")).strip().lower(), "health")
    return Profile(
        goal=goal,
        targets=targets_for(_num(old.get("daily_calories_target"), 2000)),
        timezone=timezone,
        onboarded=True,
        created_at=now,
        updated_at=now,
    )


def meal_type_for(local: dt.datetime) -> MealType:
    if local.hour < 11:
        return "breakfast"
    if local.hour < 16:
        return "lunch"
    if local.hour < 21:
        return "dinner"
    return "snack"


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "food"


def map_item(food: dict[str, Any]) -> MealItem:
    nutrition = Macros(
        kcal=round(_num(food.get("calories")), 1),
        protein_g=round(_num(food.get("protein_g")), 1),
        fat_g=round(_num(food.get("fat_g")), 1),
        carbs_g=round(_num(food.get("carbs_g")), 1),
    )
    match = _GRAMS_RE.search(str(food.get("label", "")))
    grams = min(max(float(match.group(1)), 1.0), 5000.0) if match else 100.0
    display = str(food.get("food_name_display") or food.get("food_name_raw") or "Food")[:120]
    raw_conf = str(food.get("confidence", "")).rstrip("%")
    confidence = _num(raw_conf, -1) / 100 if raw_conf else -1
    return MealItem(
        name=str(food.get("food_name_raw") or _slug(display))[:120],
        display=display,
        group=(str(food["group"])[:60] if food.get("group") else None),
        label=(str(food["food_name_raw"])[:80] if food.get("box") else None),
        confidence=confidence if 0 <= confidence <= 1 else None,
        grams=grams,
        estimated_grams=grams if match else None,
        per100g=nutrition.scaled(100.0 / grams),
        nutrition=nutrition,
    )


def map_meal(meal_id: str, old: dict[str, Any], tz: ZoneInfo, now: dt.datetime) -> Meal | None:
    foods = [f for f in old.get("foods") or [] if isinstance(f, dict)]
    if not foods:
        return None
    ts = old.get("timestamp")
    eaten = ts if isinstance(ts, dt.datetime) else now
    if eaten.tzinfo is None:
        eaten = eaten.replace(tzinfo=dt.UTC)
    local = eaten.astimezone(tz)
    items = [map_item(f) for f in foods][:30]
    totals = Macros.zero()
    for item in items:
        totals = totals + item.nutrition
    if any(f.get("box") for f in foods):
        source = "scan"
    elif any(f.get("group") == "My Pantry" for f in foods):
        source = "pantry"
    else:
        source = "barcode"
    return Meal(
        id=meal_id,
        local_date=local.date(),
        meal_type=meal_type_for(local),
        eaten_at=eaten,
        source=source,
        items=items,
        totals=totals,
        created_at=eaten,
        updated_at=now,
    )


def map_pantry(food_id: str, old: dict[str, Any], now: dt.datetime) -> PantryFood:
    per_serving = Macros(
        kcal=_num(old.get("calories")),
        protein_g=_num(old.get("protein_g")),
        fat_g=_num(old.get("fat_g")),
        carbs_g=_num(old.get("carbs_g")),
    )
    return PantryFood(
        id=food_id,
        name=str(old.get("name") or "Custom food")[:80],
        serving_g=100,
        serving_label="1 serving",
        per_serving=per_serving,
        per100g=per_serving,
        created_at=now,
        updated_at=now,
    )


def run(apply: bool, timezone: str, overwrite_profiles: bool) -> Counter[str]:
    from firebase_admin import firestore

    from app.core.firebase import get_firebase_app
    from app.repositories.firestore import to_doc

    db = firestore.client(app=get_firebase_app())
    tz = ZoneInfo(timezone)
    now = dt.datetime.now(dt.UTC)
    stats: Counter[str] = Counter()
    batch = db.batch()
    pending = 0

    def write(ref: Any, data: dict[str, Any]) -> None:
        nonlocal batch, pending
        stats["writes"] += 1
        if not apply:
            return
        batch.set(ref, data)
        pending += 1
        if pending >= 400:
            batch.commit()
            batch, pending = db.batch(), 0

    for snap in db.collection("user_profiles").stream():
        user = db.collection("users").document(snap.id)
        if not overwrite_profiles and (user.get().to_dict() or {}).get("targets"):
            stats["profiles_skipped_existing"] += 1
            continue
        write(user, to_doc(map_profile(snap.to_dict() or {}, timezone, now)))
        stats["profiles"] += 1

    for parent in db.collection("user_meals").list_documents():
        for snap in parent.collection("meals").stream():
            try:
                meal = map_meal(snap.id, snap.to_dict() or {}, tz, now)
            except ValidationError:
                stats["meals_invalid"] += 1
                continue
            if meal is None:
                stats["meals_empty"] += 1
                continue
            ref = db.collection("users").document(parent.id).collection("meals").document(meal.id)
            write(ref, to_doc(meal, exclude={"id"}))
            stats["meals"] += 1

    for parent in db.collection("user_custom_foods").list_documents():
        for snap in parent.collection("foods").stream():
            try:
                food = map_pantry(snap.id, snap.to_dict() or {}, now)
            except ValidationError:
                stats["pantry_invalid"] += 1
                continue
            ref = db.collection("users").document(parent.id).collection("pantry").document(food.id)
            write(ref, to_doc(food, exclude={"id"}))
            stats["pantry"] += 1

    if apply and pending:
        batch.commit()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate v1 Firestore data to the v2 layout.")
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    parser.add_argument("--timezone", default="UTC", help="IANA zone used to date v1 meals")
    parser.add_argument("--overwrite-profiles", action="store_true")
    args = parser.parse_args()
    ZoneInfo(args.timezone)  # fail fast on a typo
    stats = run(args.apply, args.timezone, args.overwrite_profiles)
    mode = "APPLIED" if args.apply else "DRY RUN (nothing written; add --apply)"
    print(f"{mode}: " + ", ".join(f"{k}={v}" for k, v in sorted(stats.items())))


if __name__ == "__main__":
    main()
