"""The dishes the app can name, and the text prompts an image–text model compares photos with.

Shared by compare.py (choosing a model) and export_siglip.py (building what the API serves), so the
served dish embeddings come from exactly the prompts that were evaluated.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from common import ROOT

from app.core.config import DATA_DIR

EXTRA = ROOT / "ml" / "vocab" / "extra_dishes.json"
FOOD101_CLASSES = 101  # ids 0..100 in labels.json; the EfficientNet classifier's outputs
TEMPLATES = ("a photo of {}, a type of food.", "a close-up photo of {}.")


def canonical(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


@dataclass
class Vocab:
    """Every dish in api/app/data/labels.json. Index = class id."""

    keys: list[str]
    display: dict[str, str]
    prompts: list[str]
    food101: list[str]  # the Food-101 subset, in labels.json (= EfficientNet output) order
    alias: dict[str, str] = field(default_factory=dict)

    def resolve(self, name: str) -> str:
        key = canonical(name)
        return self.alias.get(key, key)

    def texts(self, template: str) -> list[str]:
        return [template.format(p) for p in self.prompts]

    @classmethod
    def load(cls) -> Vocab:
        classes = json.loads((DATA_DIR / "labels.json").read_text())["classes"]
        raw = json.loads(EXTRA.read_text())
        extra = {d["name"]: d for d in raw["dishes"]}
        keys = [c["name"] for c in classes]
        display = {c["name"]: c["display"] for c in classes}
        missing = [name for name in extra if name not in display]
        if missing:
            raise SystemExit(f"{EXTRA.name} has dishes that labels.json lacks: {missing}")
        prompts = [extra.get(c["name"], {}).get("prompt", c["display"]).lower() for c in classes]
        alias = {canonical(a): t for a, t in raw.get("food101_aliases", {}).items()}
        for d in raw["dishes"]:
            for a in d.get("aliases", []):
                alias[canonical(a)] = d["name"]
        food101 = [c["name"] for c in classes if c["id"] < FOOD101_CLASSES]
        return cls(keys, display, prompts, food101, alias)
