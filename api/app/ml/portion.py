"""Portion estimate from box size.

grams = typical_serving_g[dish] × clamp(box_area_fraction / reference_area_fraction[dish], lo, hi)

The box area is measured as a *fraction of the image*, so the estimate no longer depends on the
photo's resolution (the v1 bug). It is a rough heuristic — the UI always lets the user adjust it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

PortionMethod = Literal["box_area", "typical_serving"]


@dataclass(frozen=True, slots=True)
class PortionEstimate:
    grams: float
    method: PortionMethod


class PortionEstimator:
    def __init__(
        self,
        default_area_frac: float,
        class_area_frac: dict[str, float],
        clamp: tuple[float, float] = (0.3, 3.0),
    ) -> None:
        self.default_area_frac = default_area_frac
        self.class_area_frac = class_area_frac
        self.lo, self.hi = clamp

    @classmethod
    def load(cls, path: Path) -> PortionEstimator:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            default_area_frac=raw["default"]["areaFrac"],
            class_area_frac={k: v["areaFrac"] for k, v in raw["classes"].items()},
            clamp=(raw["clamp"][0], raw["clamp"][1]),
        )

    def estimate(self, dish: str, serving_g: float, area_frac: float | None) -> PortionEstimate:
        if area_frac is None or area_frac <= 0:
            return PortionEstimate(round_grams(serving_g), "typical_serving")
        reference = self.class_area_frac.get(dish, self.default_area_frac)
        ratio = min(max(area_frac / reference, self.lo), self.hi)
        return PortionEstimate(round_grams(serving_g * ratio), "box_area")


def round_grams(grams: float) -> float:
    """Round to a friendly 5 g step (never below 5 g)."""
    return float(max(5, round(grams / 5) * 5))
