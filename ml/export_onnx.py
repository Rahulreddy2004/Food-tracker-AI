#!/usr/bin/env python3
"""Export the original models to ONNX for serving.

    uv run python export_onnx.py \
        --detector ../api/models/best.pt \
        --classifier ../api/models/food101_EfficientNetV2B3_final.h5 \
        --out ../api/models

Writes best.onnx and classifier.onnx and prints their sha256 (for api/models/manifest.json).
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

from common import MODELS, load_keras, sha256


def export_classifier(h5: Path, out: Path, opset: int) -> Path:
    """Keras → SavedModel → ONNX. Going through a SavedModel freezes constants that a traced
    tf.function would otherwise leave as extra graph inputs (Keras 3 Normalization layers)."""
    import subprocess
    import sys

    import tensorflow as tf

    model = load_keras(h5)
    shape = model.input_shape  # e.g. (None, 300, 300, 3)
    size = int(shape[1] or 300)
    classes = int(model.output_shape[-1])
    print(f"classifier: input {shape}, {classes} classes")
    target = out / "classifier.onnx"
    with tempfile.TemporaryDirectory() as tmp:
        saved = Path(tmp) / "saved_model"
        spec = tf.TensorSpec((None, size, size, 3), tf.float32, name="input")
        if hasattr(model, "export"):  # Keras 3
            model.export(str(saved), format="tf_saved_model", input_signature=[spec], verbose=False)
        else:  # legacy tf.keras
            tf.saved_model.save(model, str(saved))
        subprocess.run(
            [
                sys.executable,
                "-m",
                "tf2onnx.convert",
                "--saved-model",
                str(saved),
                "--output",
                str(target),
                "--opset",
                str(opset),
                "--signature_def",
                "serve",
            ],
            check=True,
        )
    import onnx

    graph = onnx.load(str(target)).graph
    inputs = [
        i.name for i in graph.input if i.name not in {init.name for init in graph.initializer}
    ]
    if len(inputs) != 1:
        raise SystemExit(f"classifier.onnx must have exactly one input, got {inputs}")
    return target


def export_detector(pt: Path, out: Path, opset: int, imgsz: int) -> Path:
    from ultralytics import YOLO

    model = YOLO(str(pt))
    print(f"detector: {len(model.names)} classes: {list(model.names.values())[:12]}")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / pt.name
        shutil.copy(pt, work)
        exported = YOLO(str(work)).export(
            format="onnx", imgsz=imgsz, opset=opset, simplify=True, dynamic=False, nms=False
        )
        target = out / "best.onnx"
        shutil.copy(exported, target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--detector", type=Path, default=MODELS / "best.pt")
    parser.add_argument(
        "--classifier", type=Path, default=MODELS / "food101_EfficientNetV2B3_final.h5"
    )
    parser.add_argument("--out", type=Path, default=MODELS)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--only", choices=["detector", "classifier"])
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    written: dict[str, str] = {}
    if args.only in (None, "classifier"):
        path = export_classifier(args.classifier, args.out, args.opset)
        written[path.name] = sha256(path)
    if args.only in (None, "detector"):
        path = export_detector(args.detector, args.out, args.opset, args.imgsz)
        written[path.name] = sha256(path)
    print(json.dumps({"serving": written}, indent=2))


if __name__ == "__main__":
    main()
