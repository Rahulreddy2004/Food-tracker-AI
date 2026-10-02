"""Shared API models. JSON on the wire is camelCase; Python stays snake_case."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True, extra="forbid"
    )


class Macros(ApiModel):
    """Energy and macronutrients for some amount of food."""

    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)

    @classmethod
    def zero(cls) -> Macros:
        return cls(kcal=0, protein_g=0, fat_g=0, carbs_g=0)

    def scaled(self, factor: float) -> Macros:
        return Macros(
            kcal=round(self.kcal * factor, 1),
            protein_g=round(self.protein_g * factor, 1),
            fat_g=round(self.fat_g * factor, 1),
            carbs_g=round(self.carbs_g * factor, 1),
        )

    def for_grams(self, grams: float) -> Macros:
        """`self` is per 100 g; return the values for `grams`."""
        return self.scaled(grams / 100.0)

    def __add__(self, other: Macros) -> Macros:
        return Macros(
            kcal=round(self.kcal + other.kcal, 1),
            protein_g=round(self.protein_g + other.protein_g, 1),
            fat_g=round(self.fat_g + other.fat_g, 1),
            carbs_g=round(self.carbs_g + other.carbs_g, 1),
        )


class NormBox(ApiModel):
    """Box as fractions of the image: top-left (x, y), width w, height h — all 0..1."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(ge=0, le=1)
    h: float = Field(ge=0, le=1)
