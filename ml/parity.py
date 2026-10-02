#!/usr/bin/env python3
"""Check that the ONNX models served by the API give the same answers as the originals.

    uv run python parity.py [--images DIR]

Classifier: same top-1 class and probabilities within --atol on every test crop.
Detector: every original box has an ONNX box with IoU > --iou (and vice versa).
Exits non-zero on any mismatch, so CI can block a bad export.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from common import API, MODELS, load_keras

from app.core.config import DATA_DIR
from app.ml.boxes import iou
from app.ml.classifier import OnnxClassifier
from app.ml.detector import OnnxYoloDetector
from app.ml.image import decode_image, resize
from app.ml.labels import LabelSet
from app.ml.structs import Box


def sample_images(folder: Path | None, count: int = 12) -> list[np.ndarray]:
    files: list[Path] = [API / "tests" / "fixtures" / "palak_paneer.jpg"]
    if folder:
        files += sorted(
            p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        )
    images = [decode_image(p.read_bytes(), 1280) for p in files]
    rng = np.random.default_rng(7)
    # Random crops of the real photos: different sizes and aspect ratios, like detector boxes.
    crops: list[np.ndarray] = []
    for _ in range(count):
        img = images[int(rng.integers(len(images)))]
        h, w = img.shape[:2]
        cw, ch = int(rng.integers(w // 4, w)), int(rng.integers(h // 4, h))
        x, y = int(rng.integers(0, w - cw + 1)), int(rng.integers(0, h - ch + 1))
        crops.append(img[y : y + ch, x : x + cw])
    return images + crops


def check_classifier(h5: Path, onnx_path: Path, images: list[np.ndarray], atol: float) -> bool:
    labels = LabelSet.load(DATA_DIR / "labels.json")
    keras_model = load_keras(h5)
    served = OnnxClassifier(onnx_path, num_classes=len(labels), threads=2)
    batch = np.stack([resize(img, (served.size, served.size)) for img in images]).astype(np.float32)
    ref = np.asarray(keras_model.predict(batch, verbose=0), dtype=np.float32)
    got = served.classify(images)
    same_top1 = (ref.argmax(1) == got.argmax(1)).all()
    max_diff = float(np.abs(ref - got).max())
    agree = "yes" if same_top1 else "NO"
    print(f"classifier: {len(images)} inputs, top-1 agreement {agree}, max |Δp| = {max_diff:.2e}")
    return bool(same_top1 and max_diff <= atol)


def check_detector(
    pt: Path, onnx_path: Path, images: list[np.ndarray], min_iou: float, conf: float
) -> bool:
    from ultralytics import YOLO

    ref_model = YOLO(str(pt))
    served = OnnxYoloDetector(onnx_path, confidence=conf, iou=0.45, max_boxes=50, threads=2)
    ok = True
    for i, img in enumerate(images[:6]):
        # rect=False: square 640 letterbox, exactly like the served detector.
        ref = ref_model.predict(
            Image.fromarray(img), conf=conf, iou=0.45, agnostic_nms=True, rect=False, verbose=False
        )[0]
        ref_boxes = [Box(*map(float, b)) for b in ref.boxes.xyxy.cpu().numpy()]
        got_boxes = [d.box for d in served.detect(img)]
        matched = all(any(iou(r, g) > min_iou for g in got_boxes) for r in ref_boxes) and all(
            any(iou(g, r) > min_iou for r in ref_boxes) for g in got_boxes
        )
        verdict = "match" if matched else "MISMATCH"
        print(f"detector: image {i}: {len(ref_boxes)} original, {len(got_boxes)} ONNX, {verdict}")
        ok &= matched
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--models", type=Path, default=MODELS)
    parser.add_argument("--images", type=Path, help="optional folder of extra food photos")
    parser.add_argument("--atol", type=float, default=1e-3)
    parser.add_argument("--iou", type=float, default=0.95)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--only", choices=["detector", "classifier"])
    args = parser.parse_args()

    images = sample_images(args.images)
    ok = True
    if args.only in (None, "classifier"):
        ok &= check_classifier(
            args.models / "food101_EfficientNetV2B3_final.h5",
            args.models / "classifier.onnx",
            images,
            args.atol,
        )
    if args.only in (None, "detector"):
        ok &= check_detector(
            args.models / "best.pt", args.models / "best.onnx", images, args.iou, args.conf
        )
    print("PARITY OK" if ok else "PARITY FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
