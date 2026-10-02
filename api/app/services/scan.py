"""Turns raw pipeline output into the API response: labels, nutrition, portion per guess."""

from __future__ import annotations

import uuid

import anyio

from app.core.errors import ApiError
from app.ml.labels import LabelSet
from app.ml.pipeline import ScanPipeline
from app.ml.portion import PortionEstimator
from app.ml.structs import PipelineResult
from app.schemas.common import Macros, NormBox
from app.schemas.scan import ModelInfo, Prediction, ScanItem, ScanResponse, ScanTimings
from app.services.nutrition import NutritionTable

_FALLBACK = Macros.zero()


class ScanService:
    def __init__(
        self,
        pipeline: ScanPipeline | None,
        labels: LabelSet,
        nutrition: NutritionTable,
        portions: PortionEstimator,
        confirm_below: float,
        max_concurrent: int = 2,
        unavailable_reason: str | None = None,
    ) -> None:
        self.pipeline = pipeline
        self.labels = labels
        self.nutrition = nutrition
        self.portions = portions
        self.confirm_below = confirm_below
        self.unavailable_reason = unavailable_reason
        # ONNX Runtime already uses several threads per call; cap parallel scans per instance.
        self._limiter = anyio.CapacityLimiter(max_concurrent)

    @property
    def ready(self) -> bool:
        return self.pipeline is not None

    async def scan(self, data: bytes) -> ScanResponse:
        pipeline = self.pipeline
        if pipeline is None:
            raise ApiError(
                503,
                "models_unavailable",
                "Food recognition is starting up or unavailable",
                "Please try again in a minute.",
            )
        result = await anyio.to_thread.run_sync(pipeline.run, data, limiter=self._limiter)
        return self.to_response(result, pipeline)

    def to_response(self, result: PipelineResult, pipeline: ScanPipeline) -> ScanResponse:
        image_area = float(result.width * result.height)
        items: list[ScanItem] = []
        for item in result.items:
            area_frac = item.box.area / image_area if item.box else None
            predictions: list[Prediction] = []
            for score in item.top:
                food = self.labels[score.class_id]
                entry = self.nutrition.get(food.name)
                per100g = entry.per100g if entry else _FALLBACK
                serving = entry.serving_g if entry else 100.0
                portion = self.portions.estimate(food.name, serving, area_frac)
                predictions.append(
                    Prediction(
                        label=food.name,
                        display=food.display,
                        group=food.group,
                        confidence=round(score.confidence, 4),
                        per100g=per100g,
                        suggested_grams=portion.grams,
                        portion_method=portion.method,
                    )
                )
            box = None
            if item.box:
                b = item.box
                box = NormBox(
                    x=round(b.x1 / result.width, 4),
                    y=round(b.y1 / result.height, 4),
                    w=round(b.width / result.width, 4),
                    h=round(b.height / result.height, 4),
                )
            items.append(
                ScanItem(
                    id=uuid.uuid4().hex[:12],
                    box=box,
                    detector_score=round(item.detector_score, 4) if item.detector_score else None,
                    needs_confirmation=item.top[0].confidence < self.confirm_below,
                    predictions=predictions,
                )
            )
        t = result.timings
        return ScanResponse(
            scan_id=uuid.uuid4().hex,
            width=result.width,
            height=result.height,
            source="detector" if result.source == "detector" else "full_image",
            items=items,
            timings=ScanTimings(
                decode_ms=t.decode_ms,
                detect_ms=t.detect_ms,
                classify_ms=t.classify_ms,
                total_ms=t.total_ms,
            ),
            models=ModelInfo(detector=pipeline.detector.name, classifier=pipeline.classifier.name),
        )
