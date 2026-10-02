"""Run the real ONNX Runtime code paths on tiny synthetic graphs (no model weights needed)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnx
import pytest
from onnx import TensorProto, helper, numpy_helper

from app.ml.classifier import OnnxClassifier
from app.ml.detector import OnnxYoloDetector
from app.ml.runtime import ModelLoadError


def _constant_model(
    path: Path,
    input_name: str,
    input_shape: list[int | str],
    output: np.ndarray,
    metadata: dict[str, str] | None = None,
) -> Path:
    """Graph whose output is a fixed tensor (plus 0 × mean(input), so the input is really used)."""
    const = numpy_helper.from_array(output.astype(np.float32), name="const")
    zero = numpy_helper.from_array(np.array(0.0, dtype=np.float32), name="zero")
    nodes = [
        helper.make_node("ReduceMean", [input_name], ["mean"], keepdims=0),
        helper.make_node("Mul", ["mean", "zero"], ["zeroed"]),
        helper.make_node("Add", ["const", "zeroed"], ["out"]),
    ]
    graph = helper.make_graph(
        nodes,
        "g",
        [helper.make_tensor_value_info(input_name, TensorProto.FLOAT, input_shape)],
        [helper.make_tensor_value_info("out", TensorProto.FLOAT, list(output.shape))],
        initializer=[const, zero],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 9
    for key, value in (metadata or {}).items():
        entry = model.metadata_props.add()
        entry.key, entry.value = key, value
    onnx.save(model, path)
    return path


def test_yolo_decode_letterbox_and_nms(tmp_path: Path) -> None:
    # 1 class, 3 anchors in the 640×640 letterboxed frame: (cx, cy, w, h, score).
    anchors = np.array(
        [
            [320, 320, 200, 100, 0.90],  # kept
            [322, 321, 200, 100, 0.80],  # overlaps the first → removed by NMS
            [100, 400, 50, 50, 0.10],  # below confidence → removed
        ],
        dtype=np.float32,
    )
    output = anchors.T[None]  # (1, 4 + nc, anchors)
    path = _constant_model(
        tmp_path / "det.onnx", "images", [1, 3, 640, 640], output, {"names": "{0: 'food'}"}
    )
    det = OnnxYoloDetector(path, confidence=0.25, iou=0.45, max_boxes=10, threads=1)
    # A 1280×640 photo is scaled by 0.5 and padded 160 px top and bottom in the letterbox.
    image = np.zeros((640, 1280, 3), dtype=np.uint8)
    found = det.detect(image)
    assert len(found) == 1
    box = found[0].box
    assert found[0].label == "food"
    assert found[0].score == pytest.approx(0.9)
    assert (box.x1, box.y1, box.x2, box.y2) == pytest.approx((440, 220, 840, 420), abs=1)


def test_yolo_with_builtin_nms_output(tmp_path: Path) -> None:
    rows = np.array([[[10, 10, 110, 60, 0.8, 0], [0, 0, 5, 5, 0.1, 0]]], dtype=np.float32)
    path = _constant_model(tmp_path / "det_nms.onnx", "images", [1, 3, 640, 640], rows)
    det = OnnxYoloDetector(path, confidence=0.25, iou=0.45, max_boxes=10, threads=1)
    found = det.detect(np.zeros((640, 640, 3), dtype=np.uint8))
    assert len(found) == 1
    assert found[0].box.x2 == pytest.approx(110)


def test_classifier_batches_and_normalises(tmp_path: Path) -> None:
    logits = np.zeros((2, 101), dtype=np.float32)
    logits[0, 5], logits[1, 42] = 8.0, 8.0
    path = _constant_model(tmp_path / "cls.onnx", "input", ["batch", 300, 300, 3], logits)
    clf = OnnxClassifier(path, num_classes=101, threads=1)
    assert clf.channels_last and clf.size == 300
    crops = [np.zeros((120, 80, 3), np.uint8), np.zeros((50, 200, 3), np.uint8)]
    probs = clf.classify(crops)
    assert probs.shape == (2, 101)
    assert np.allclose(probs.sum(axis=1), 1)
    assert probs[0].argmax() == 5 and probs[1].argmax() == 42


def test_classifier_rejects_wrong_label_count(tmp_path: Path) -> None:
    path = _constant_model(tmp_path / "bad.onnx", "input", [1, 300, 300, 3], np.zeros((1, 50)))
    with pytest.raises(ModelLoadError):
        OnnxClassifier(path, num_classes=101, threads=1)


def test_missing_model_file_is_a_clear_error(tmp_path: Path) -> None:
    with pytest.raises(ModelLoadError, match="fetch_models"):
        OnnxClassifier(tmp_path / "nope.onnx", num_classes=101)
