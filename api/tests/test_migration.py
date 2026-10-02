from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from app.tools.migrate_v1 import map_item, map_meal, map_pantry, map_profile, targets_for

NOW = dt.datetime(2026, 10, 2, 12, tzinfo=dt.UTC)
IST = ZoneInfo("Asia/Kolkata")


def test_profile_mapping() -> None:
    profile = map_profile(
        {"goal": "weight loss", "daily_calories_target": 1800}, "Asia/Kolkata", NOW
    )
    assert profile.goal == "lose" and profile.onboarded
    assert profile.targets.kcal == 1800 and profile.targets.protein_g == 90
    assert map_profile({}, "UTC", NOW).goal == "health"
    assert targets_for(100).kcal == 800, "clamped to a safe minimum"


def test_scanned_item_keeps_grams_from_v1_label() -> None:
    item = map_item(
        {
            "food_name_raw": "pizza",
            "food_name_display": "pizza",
            "group": "Pizza",
            "confidence": "82.50%",
            "box": [1, 2, 3, 4],
            "label": "319 kcal (Est. 120g)",
            "calories": 319.2,
            "protein_g": 13.7,
            "fat_g": 12.5,
            "carbs_g": 39.6,
        }
    )
    assert item.grams == 120 and item.estimated_grams == 120
    assert item.confidence == 0.825 and item.label == "pizza"
    assert item.per100g.kcal == 266
    assert item.nutrition.kcal == 319.2


def test_meal_dated_in_users_timezone() -> None:
    # 20:30 UTC on Oct 1 is 02:00 on Oct 2 in India.
    ts = dt.datetime(2026, 10, 1, 20, 30, tzinfo=dt.UTC)
    meal = map_meal(
        "m1",
        {
            "timestamp": ts,
            "foods": [{"food_name_display": "Chai", "calories": 90, "label": "90 kcal"}],
        },
        IST,
        NOW,
    )
    assert meal is not None
    assert meal.local_date == dt.date(2026, 10, 2)
    assert meal.meal_type == "breakfast"
    assert meal.source == "barcode"
    assert meal.items[0].grams == 100  # no "Est." in the label
    assert map_meal("m2", {"foods": []}, IST, NOW) is None


def test_pantry_mapping() -> None:
    food = map_pantry("f1", {"name": "Poha", "calories": "250", "protein_g": 5, "fat_g": None}, NOW)
    assert food.per_serving.kcal == 250 and food.per_serving.fat_g == 0
    assert food.serving_g == 100
