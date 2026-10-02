"""Unit tests for geometry, portions, image decoding and the pipeline with fake models."""

from __future__ import annotations

import io
import json

import numpy as np
import pytest
from PIL import Image

from app.core.config import API_DIR, DATA_DIR
from app.core.errors import ApiError
from app.ml.boxes import iou, nms, overlap_of_smaller
from app.ml.classifier import FakeClassifier, as_probabilities
from app.ml.detector import FakeDetector
from app.ml.image import decode_image
from app.ml.labels import LabelSet
from app.ml.pipeline import PipelineConfig, ScanPipeline
from app.ml.portion import PortionEstimator, round_grams
from app.ml.structs import Box, Detection, RGBImage
from app.services.nutrition import NutritionTable
from tests.conftest import make_jpeg

LABELS = LabelSet.load(DATA_DIR / "labels.json")


# --- labels -------------------------------------------------------------------------------------


def test_labels_keep_food101_in_model_order_then_extra_dishes() -> None:
    # Ids 0..100 are the EfficientNet's outputs; the open-vocabulary classifier knows all of them.
    assert len(LABELS) == 200
    assert LABELS[0].name == "apple_pie"
    assert LABELS[100].name == "waffles"
    assert LABELS[101].name == "palak_paneer"
    assert len({c.name for c in LABELS.classes}) == len(LABELS), "names must be unique"
    assert all(c.group and c.display for c in LABELS.classes), "every dish needs a group and name"


def test_every_dish_has_nutrition_and_a_serving() -> None:
    table = NutritionTable.load(DATA_DIR / "nutrition.json")
    missing = [c.name for c in LABELS.classes if table.get(c.name) is None]
    assert not missing, f"no nutrition for {missing}"
    for c in LABELS.classes:
        entry = table.get(c.name)
        assert entry is not None and entry.serving_g > 0
        m = entry.per100g
        atwater = 4 * m.protein_g + 4 * m.carbs_g + 9 * m.fat_g
        assert abs(atwater - m.kcal) / m.kcal < 0.3, f"{c.name}: {m.kcal} kcal vs macros {atwater}"


def test_ml_vocabulary_matches_labels() -> None:
    """ml/vocab/extra_dishes.json holds the prompts for the dishes beyond Food-101."""
    vocab = json.loads((API_DIR.parent / "ml" / "vocab" / "extra_dishes.json").read_text())
    extra = [d["name"] for d in vocab["dishes"]]
    assert extra == [c.name for c in LABELS.classes[101:]], "same dishes, same order"


# --- geometry -------------------------------------------------------------------------------------


def test_iou_and_containment() -> None:
    a, b = Box(0, 0, 10, 10), Box(5, 5, 15, 15)
    assert iou(a, b) == pytest.approx(25 / 175)
    assert iou(a, Box(20, 20, 30, 30)) == 0
    inner = Box(2, 2, 4, 4)
    assert overlap_of_smaller(a, inner) == pytest.approx(1.0)


def test_nms_keeps_best_and_drops_overlaps() -> None:
    boxes = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [50, 50, 60, 60]], dtype=np.float32)
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
    assert nms(boxes, scores, iou_threshold=0.5, max_keep=10) == [0, 2]
    assert nms(boxes, scores, iou_threshold=0.5, max_keep=1) == [0]
    assert nms(np.zeros((0, 4), np.float32), np.zeros(0, np.float32), 0.5, 5) == []


# --- portions -------------------------------------------------------------------------------------


def test_portion_is_resolution_independent() -> None:
    """The v1 bug: a 12 MP photo gave 30x the calories of a 640 px photo of the same plate."""
    est = PortionEstimator.load(DATA_DIR / "portions.json")
    small = est.estimate("pizza", 200, area_frac=(320 * 640) / (640 * 640))
    large = est.estimate("pizza", 200, area_frac=(2016 * 3024) / (4032 * 3024))
    assert small == large
    assert small.method == "box_area"


def test_portion_clamps_and_falls_back() -> None:
    est = PortionEstimator(default_area_frac=0.4, class_area_frac={}, clamp=(0.5, 2.0))
    assert est.estimate("x", 100, area_frac=0.01).grams == 50  # clamped low
    assert est.estimate("x", 100, area_frac=0.99).grams == 200  # clamped high
    assert est.estimate("x", 100, area_frac=0.4).grams == 100
    fallback = est.estimate("x", 180, area_frac=None)
    assert (fallback.grams, fallback.method) == (180, "typical_serving")
    assert round_grams(2) == 5 and round_grams(123) == 125


# --- image decoding -------------------------------------------------------------------------------


def test_decode_caps_size_and_returns_rgb() -> None:
    image = decode_image(make_jpeg(4000, 3000), max_side=1280)
    assert image.shape == (960, 1280, 3)
    assert image.dtype == np.uint8


def test_decode_applies_exif_rotation() -> None:
    img = Image.new("RGB", (400, 200), (10, 200, 10))
    exif = img.getexif()
    exif[0x0112] = 6  # "rotate 90° clockwise to display"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    decoded = decode_image(buf.getvalue(), max_side=2000)
    assert decoded.shape[:2] == (400, 200), "portrait after applying EXIF orientation"


def test_decode_png_with_alpha_becomes_rgb() -> None:
    buf = io.BytesIO()
    Image.new("RGBA", (64, 48), (255, 0, 0, 128)).save(buf, format="PNG")
    assert decode_image(buf.getvalue(), max_side=1280).shape == (48, 64, 3)


@pytest.mark.parametrize("payload", [b"not an image", b"\x89PNG\r\n\x1a\nbroken", b""])
def test_decode_rejects_garbage(payload: bytes) -> None:
    with pytest.raises(ApiError) as err:
        decode_image(payload, max_side=1280)
    assert err.value.status == 415


def test_decode_rejects_disallowed_format() -> None:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32)).save(buf, format="TIFF")
    with pytest.raises(ApiError) as err:
        decode_image(buf.getvalue(), max_side=1280)
    assert err.value.code == "unsupported_image"


# --- pipeline -------------------------------------------------------------------------------------


class _NoBoxes:
    name = "none"

    def detect(self, image: RGBImage) -> list[Detection]:
        return []


class _Boxes:
    name = "fixed"

    def __init__(self, boxes: list[tuple[Box, float]]) -> None:
        self.boxes = boxes

    def detect(self, image: RGBImage) -> list[Detection]:
        return [Detection(b, s) for b, s in self.boxes]


class _SameDish:
    name = "same"

    def classify(self, crops: list[RGBImage]) -> np.ndarray:
        probs = np.full((len(crops), 101), 0.001, dtype=np.float32)
        pizza = LABELS.by_name("pizza")
        assert pizza is not None
        probs[:, pizza.id] = 0.9
        return probs


def test_fake_pipeline_returns_top_k_sorted_by_size() -> None:
    pipeline = ScanPipeline(FakeDetector(), FakeClassifier(LABELS), PipelineConfig(top_k=3))
    result = pipeline.run(make_jpeg(800, 600))
    assert result.source == "detector"
    assert len(result.items) == 3
    areas = [it.box.area for it in result.items if it.box]
    assert areas == sorted(areas, reverse=True)
    for item in result.items:
        assert len(item.top) == 3
        confs = [s.confidence for s in item.top]
        assert confs == sorted(confs, reverse=True)
    assert LABELS[result.items[0].top[0].class_id].name == "pizza"
    assert result.timings.total_ms >= result.timings.classify_ms


def test_pipeline_falls_back_to_whole_image() -> None:
    pipeline = ScanPipeline(_NoBoxes(), FakeClassifier(LABELS), PipelineConfig())
    result = pipeline.run(make_jpeg(320, 240))
    assert result.source == "full_image"
    assert len(result.items) == 1 and result.items[0].box is None


def test_pipeline_drops_tiny_boxes_and_merges_duplicates() -> None:
    boxes = [
        (Box(0, 0, 100, 100), 0.9),
        (Box(5, 5, 100, 100), 0.8),  # same dish, heavy overlap → merged
        (Box(20, 20, 40, 40), 0.7),  # same dish, inside the first → merged
        (Box(150, 150, 152, 152), 0.95),  # below 1% of the frame → dropped
    ]
    pipeline = ScanPipeline(_Boxes(boxes), _SameDish(), PipelineConfig())
    result = pipeline.run(make_jpeg(200, 200))
    assert len(result.items) == 1
    assert result.items[0].detector_score == 0.9


def test_as_probabilities_handles_logits_and_softmax() -> None:
    probs = np.array([[0.7, 0.2, 0.1]], dtype=np.float32)
    assert np.allclose(as_probabilities(probs), probs)
    logits = np.array([[2.0, 1.0, -1.0]], dtype=np.float32)
    out = as_probabilities(logits)
    assert np.allclose(out.sum(axis=1), 1) and out[0].argmax() == 0
