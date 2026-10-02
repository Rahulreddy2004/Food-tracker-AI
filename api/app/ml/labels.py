"""Class labels for the Food-101 classifier (index = model output index)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class FoodClass:
    id: int
    name: str
    display: str
    group: str


class LabelSet:
    def __init__(self, classes: list[FoodClass]) -> None:
        ids = [c.id for c in classes]
        if ids != list(range(len(classes))):
            raise ValueError("labels.json ids must be 0..N-1 in order")
        self.classes = classes
        self._by_name = {c.name: c for c in classes}

    @classmethod
    def load(cls, path: Path) -> LabelSet:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return cls([FoodClass(**item) for item in raw["classes"]])

    def __len__(self) -> int:
        return len(self.classes)

    def __getitem__(self, class_id: int) -> FoodClass:
        return self.classes[class_id]

    def by_name(self, name: str) -> FoodClass | None:
        return self._by_name.get(name)
