"""Box geometry helpers: IoU, non-maximum suppression and duplicate merging."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from app.ml.structs import Box

FloatArray = npt.NDArray[np.float32]


def iou(a: Box, b: Box) -> float:
    inter = intersection(a, b)
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def intersection(a: Box, b: Box) -> float:
    w = min(a.x2, b.x2) - max(a.x1, b.x1)
    h = min(a.y2, b.y2) - max(a.y1, b.y1)
    return max(0.0, w) * max(0.0, h)


def overlap_of_smaller(a: Box, b: Box) -> float:
    """Intersection divided by the smaller box's area (1.0 when one box sits inside the other)."""
    smaller = min(a.area, b.area)
    return intersection(a, b) / smaller if smaller > 0 else 0.0


def nms(
    boxes_xyxy: FloatArray, scores: FloatArray, iou_threshold: float, max_keep: int
) -> list[int]:
    """Greedy class-agnostic NMS. Returns kept indices, highest score first."""
    if boxes_xyxy.size == 0:
        return []
    x1, y1, x2, y2 = boxes_xyxy.T
    areas = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0 and len(keep) < max_keep:
        i = int(order[0])
        keep.append(i)
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        union = areas[i] + areas[rest] - inter
        ious = np.where(union > 0, inter / np.maximum(union, 1e-9), 0.0)
        order = rest[ious <= iou_threshold]
    return keep
