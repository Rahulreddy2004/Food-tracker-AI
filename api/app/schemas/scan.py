from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel, Macros, NormBox


class Prediction(ApiModel):
    label: str = Field(description="Dish name from labels.json, e.g. `palak_paneer`")
    display: str
    group: str
    confidence: float = Field(ge=0, le=1)
    per100g: Macros = Field(alias="per100g")
    suggested_grams: float = Field(gt=0, description="Estimated portion if this guess is right")
    portion_method: Literal["box_area", "typical_serving"]


class ScanItem(ApiModel):
    id: str
    box: NormBox | None = Field(description="Null when the whole photo was classified")
    detector_score: float | None
    needs_confirmation: bool = Field(description="True when the top guess is not confident")
    predictions: list[Prediction] = Field(min_length=1, description="Best guess first")


class ScanTimings(ApiModel):
    decode_ms: float
    detect_ms: float
    classify_ms: float
    total_ms: float


class ModelInfo(ApiModel):
    detector: str
    classifier: str
    demo: bool = Field(
        description="True when stand-in models answered (MODEL_BACKEND=fake); they ignore the photo"
    )


class ScanResponse(ApiModel):
    scan_id: str
    width: int
    height: int
    source: Literal["detector", "full_image"]
    items: list[ScanItem]
    timings: ScanTimings
    models: ModelInfo
