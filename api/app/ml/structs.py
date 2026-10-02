"""Plain data types shared by the ML pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt

# RGB image, shape (H, W, 3), dtype uint8.
RGBImage = npt.NDArray[np.uint8]


@dataclass(frozen=True, slots=True)
class Box:
    """Axis-aligned box in pixel coordinates (x1, y1) top-left, (x2, y2) bottom-right."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    def clip(self, width: int, height: int) -> Box:
        return Box(
            min(max(self.x1, 0.0), width),
            min(max(self.y1, 0.0), height),
            min(max(self.x2, 0.0), width),
            min(max(self.y2, 0.0), height),
        )

    def pad(self, frac: float, width: int, height: int) -> Box:
        dx, dy = self.width * frac, self.height * frac
        return Box(self.x1 - dx, self.y1 - dy, self.x2 + dx, self.y2 + dy).clip(width, height)


@dataclass(frozen=True, slots=True)
class Detection:
    box: Box
    score: float
    label: str | None = None


@dataclass(frozen=True, slots=True)
class ClassScore:
    class_id: int
    confidence: float


@dataclass(slots=True)
class StageTimings:
    decode_ms: float = 0.0
    detect_ms: float = 0.0
    classify_ms: float = 0.0
    total_ms: float = 0.0


@dataclass(slots=True)
class PipelineItem:
    box: Box | None
    detector_score: float | None
    top: list[ClassScore]


@dataclass(slots=True)
class PipelineResult:
    width: int
    height: int
    source: str  # "detector" | "full_image"
    items: list[PipelineItem] = field(default_factory=list)
    timings: StageTimings = field(default_factory=StageTimings)
