#!/usr/bin/env python3
"""Refresh api/app/data/nutrition.json from CalorieNinjas (keeps typical serving sizes).

    CALORIENINJAS_API_KEY=... python scripts/build_nutrition_table.py [--dry-run]

Each dish is queried as "100g <dish name>". Values that look implausible (kcal far from the
4/4/9 Atwater estimate of its macros) keep the curated number and are reported.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "api" / "app" / "data" / "nutrition.json"
URL = "https://api.calorieninjas.com/v1/nutrition?query="


def fetch(name: str, key: str) -> dict[str, float] | None:
    query = urllib.parse.quote(f"100g {name.replace('_', ' ')}")
    req = urllib.request.Request(URL + query, headers={"X-Api-Key": key})
    with urllib.request.urlopen(req, timeout=15) as res:
        items = json.load(res).get("items", [])
    if not items:
        return None
    total = {"kcal": 0.0, "proteinG": 0.0, "fatG": 0.0, "carbsG": 0.0, "grams": 0.0}
    for it in items:
        try:
            total["kcal"] += float(it["calories"])
            total["proteinG"] += float(it["protein_g"])
            total["fatG"] += float(it["fat_total_g"])
            total["carbsG"] += float(it["carbohydrates_total_g"])
            total["grams"] += float(it["serving_size_g"])
        except (KeyError, TypeError, ValueError):
            return None  # premium-only fields come back as text
    if total["grams"] <= 0:
        return None
    f = 100.0 / total["grams"]
    return {k: round(v * f, 1) for k, v in total.items() if k != "grams"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    key = os.environ.get("CALORIENINJAS_API_KEY")
    if not key:
        print("Set CALORIENINJAS_API_KEY", file=sys.stderr)
        return 1
    table = json.loads(TABLE.read_text())
    changed, skipped = 0, []
    for name, entry in table["items"].items():
        new = fetch(name, key)
        time.sleep(0.2)
        if not new:
            skipped.append(name)
            continue
        atwater = 4 * new["proteinG"] + 4 * new["carbsG"] + 9 * new["fatG"]
        if new["kcal"] <= 0 or abs(atwater - new["kcal"]) / new["kcal"] > 0.25:
            skipped.append(name)
            continue
        entry.update(new)
        changed += 1
    table["source"] = "calorieninjas"
    print(f"updated {changed}, kept curated values for {len(skipped)}: {', '.join(skipped)}")
    if not args.dry_run:
        TABLE.write_text(json.dumps(table, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
