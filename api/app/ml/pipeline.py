"""The scan pipeline: decode → detect → crop → classify (one batch) → top-k → de-duplicate."""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np

from app.ml.boxes import iou, overlap_of_smaller
from app.ml.classifier import Classifier
from app.ml.detector import Detector
from app.ml.image import crop, decode_image
from app.ml.structs import (
    ClassScore,
    Detection,
    PipelineItem,
    PipelineResult,
    RGBImage,
    StageTimings,
)


@dataclass(frozen=True, slots=True)
class PipelineConfig:
    max_image_side: int = 1280
    min_box_area_frac: float = 0.01
    crop_pad_frac: float = 0.0
    dedupe_iou: float = 0.6
    dedupe_containment: float = 0.85
    top_k: int = 3


class ScanPipeline:
    def __init__(self, detector: Detector, classifier: Classifier, config: PipelineConfig) -> None:
        self.detector = detector
        self.classifier = classifier
        self.config = config

    def run(self, data: bytes) -> PipelineResult:
        started = time.perf_counter()
        image = decode_image(data, self.config.max_image_side)
        decoded = time.perf_counter()
        result = self.run_image(image)
        result.timings.decode_ms = _ms(decoded - started)
        result.timings.total_ms = _ms(time.perf_counter() - started)
        return result

    def run_image(self, image: RGBImage) -> PipelineResult:
        h, w = image.shape[:2]
        timings = StageTimings()

        t0 = time.perf_counter()
        min_area = self.config.min_box_area_frac * w * h
        detections = [d for d in self.detector.detect(image) if d.box.area >= min_area]
        timings.detect_ms = _ms(time.perf_counter() - t0)

        source = "detector" if detections else "full_image"
        if detections:
            crops = [crop(image, d.box.pad(self.config.crop_pad_frac, w, h)) for d in detections]
        else:
            crops = [image]

        t1 = time.perf_counter()
        probs = self.classifier.classify(crops)
        timings.classify_ms = _ms(time.perf_counter() - t1)

        items: list[PipelineItem] = []
        for i, row in enumerate(probs):
            top_ids = np.argsort(row)[::-1][: self.config.top_k]
            top = [ClassScore(int(c), float(row[c])) for c in top_ids]
            det: Detection | None = detections[i] if detections else None
            items.append(
                PipelineItem(
                    box=det.box if det else None,
                    detector_score=det.score if det else None,
                    top=top,
                )
            )

        items = self._dedupe(items)
        items.sort(key=lambda it: it.box.area if it.box else float("inf"), reverse=True)
        return PipelineResult(width=w, height=h, source=source, items=items, timings=timings)

    def _dedupe(self, items: list[PipelineItem]) -> list[PipelineItem]:
        """Merge boxes that show the same dish twice (overlapping or one inside the other)."""
        ranked = sorted(items, key=lambda it: it.detector_score or 0.0, reverse=True)
        kept: list[PipelineItem] = []
        for item in ranked:
            if item.box is None:
                kept.append(item)
                continue
            duplicate = any(
                other.box is not None
                and other.top[0].class_id == item.top[0].class_id
                and (
                    iou(other.box, item.box) > self.config.dedupe_iou
                    or overlap_of_smaller(other.box, item.box) > self.config.dedupe_containment
                )
                for other in kept
            )
            if not duplicate:
                kept.append(item)
        return kept


def _ms(seconds: float) -> float:
    return round(seconds * 1000, 1)
