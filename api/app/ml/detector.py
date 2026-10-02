"""Food detectors. `OnnxYoloDetector` runs the YOLOv8 `best.pt` model exported to ONNX."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from app.ml.boxes import nms
from app.ml.runtime import load_session
from app.ml.structs import Box, Detection, RGBImage


class Detector(Protocol):
    name: str

    def detect(self, image: RGBImage) -> list[Detection]: ...


class OnnxYoloDetector:
    """YOLOv8 ONNX export: output `[1, 4 + classes, anchors]`, or `[1, N, 6]` with NMS built in."""

    def __init__(
        self,
        path: Path,
        *,
        confidence: float,
        iou: float,
        max_boxes: int,
        threads: int = 2,
    ) -> None:
        self.session = load_session(path, threads)
        self.input_name = self.session.get_inputs()[0].name
        shape = self.session.get_inputs()[0].shape
        self.size = shape[2] if isinstance(shape[2], int) else 640
        meta = self.session.get_modelmeta().custom_metadata_map
        self.class_names: dict[int, str] = {}
        if "names" in meta:
            try:
                self.class_names = {
                    int(k): str(v) for k, v in ast.literal_eval(meta["names"]).items()
                }
            except (ValueError, SyntaxError):
                self.class_names = {}
        self.confidence = confidence
        self.iou = iou
        self.max_boxes = max_boxes
        self.name = f"yolov8-onnx:{path.name}"

    def _letterbox(self, image: RGBImage) -> tuple[np.ndarray, float, float, float]:
        h, w = image.shape[:2]
        r = min(self.size / h, self.size / w)
        new_w, new_h = round(w * r), round(h * r)
        dw, dh = (self.size - new_w) / 2, (self.size - new_h) / 2
        left, top = round(dw - 0.1), round(dh - 0.1)
        resized = np.asarray(
            Image.fromarray(image).resize((new_w, new_h), Image.Resampling.BILINEAR), dtype=np.uint8
        )
        canvas = np.full((self.size, self.size, 3), 114, dtype=np.uint8)
        canvas[top : top + new_h, left : left + new_w] = resized
        tensor = canvas.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        return tensor, r, float(left), float(top)

    def detect(self, image: RGBImage) -> list[Detection]:
        h, w = image.shape[:2]
        tensor, r, left, top = self._letterbox(image)
        output = self.session.run(None, {self.input_name: tensor})[0]
        preds = np.asarray(output)[0]

        if preds.ndim == 2 and preds.shape[-1] == 6 and preds.shape[0] <= 1000:
            # Exported with NMS: rows are (x1, y1, x2, y2, score, class).
            rows = preds[preds[:, 4] >= self.confidence]
            boxes, scores, classes = rows[:, :4], rows[:, 4], rows[:, 5].astype(int)
            keep = list(range(min(len(rows), self.max_boxes)))
        else:
            preds = preds.T  # (anchors, 4 + nc)
            class_scores = preds[:, 4:]
            scores = class_scores.max(axis=1)
            mask = scores >= self.confidence
            preds, scores = preds[mask], scores[mask]
            classes = class_scores[mask].argmax(axis=1)
            cx, cy, bw, bh = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
            boxes = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], axis=1)
            keep = nms(
                boxes.astype(np.float32), scores.astype(np.float32), self.iou, self.max_boxes
            )

        detections: list[Detection] = []
        for i in keep:
            x1, y1, x2, y2 = boxes[i]
            box = Box((x1 - left) / r, (y1 - top) / r, (x2 - left) / r, (y2 - top) / r).clip(w, h)
            if box.area <= 0:
                continue
            label = self.class_names.get(int(classes[i]))
            detections.append(Detection(box=box, score=float(scores[i]), label=label))
        return detections


class FakeDetector:
    """Deterministic detector for tests, demos and E2E runs (no model files needed)."""

    name = "fake-detector"

    #: Boxes as fractions of the image (x1, y1, x2, y2) with a detector score.
    LAYOUT = (
        ((0.06, 0.10, 0.56, 0.72), 0.91),
        ((0.60, 0.12, 0.95, 0.50), 0.84),
        ((0.58, 0.56, 0.92, 0.92), 0.63),
    )

    def __init__(self, boxes: int = 3) -> None:
        self.boxes = boxes

    def detect(self, image: RGBImage) -> list[Detection]:
        h, w = image.shape[:2]
        return [
            Detection(Box(x1 * w, y1 * h, x2 * w, y2 * h), score, "food")
            for (x1, y1, x2, y2), score in self.LAYOUT[: self.boxes]
        ]
