"""The served SigLIP 2 path, with a tiny stand-in image encoder (tests/fixtures/zeroshot)."""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pytest

from app.container import build_pipeline
from app.core.config import DATA_DIR, Settings
from app.ml.classifier import ZeroShotClassifier
from app.ml.labels import LabelSet
from app.ml.runtime import ModelLoadError
from tests.conftest import make_jpeg

FIXTURE = Path(__file__).parent / "fixtures" / "zeroshot" / "vision.onnx"
LABELS = LabelSet.load(DATA_DIR / "labels.json")
#: The stand-in encoder embeds a photo as its mean colour, so these dishes are "red/green/blue".
COLOURS = {"pizza": (1, -1, -1), "caesar_salad": (-1, 1, -1), "palak_paneer": (-1, -1, 1)}


def write_dishes(path: Path, names: list[str] | None = None, dim: int = 4) -> Path:
    names = names if names is not None else [c.name for c in LABELS.classes]
    rng = np.random.default_rng(0)
    emb = rng.normal(0, 0.05, (len(names), dim)).astype(np.float32)
    emb[:, -1] += 1.0  # every other dish points "nowhere in colour space"
    for i, name in enumerate(names):
        if name in COLOURS:
            emb[i] = [*COLOURS[name], *([0.0] * (dim - 3))]
    np.savez(
        path,
        names=np.array(names),
        embeddings=emb,
        logit_scale=np.float32(30.0),
        logit_bias=np.float32(-5.0),
        image_size=np.int32(32),
        mean=np.full(3, 0.5, np.float32),
        std=np.full(3, 0.5, np.float32),
        rescale=np.float32(1 / 255),
        resample=np.array("bilinear"),
    )
    return path


def solid(color: tuple[int, int, int]) -> np.ndarray:
    return np.full((48, 64, 3), color, dtype=np.uint8)


def test_scores_every_dish_and_names_the_right_one(tmp_path: Path) -> None:
    clf = ZeroShotClassifier(FIXTURE, write_dishes(tmp_path / "d.npz"), LABELS, threads=1)
    probs = clf.classify([solid((230, 20, 20)), solid((20, 230, 20)), solid((20, 20, 230))])
    assert probs.shape == (3, len(LABELS))
    assert np.allclose(probs.sum(axis=1), 1, atol=1e-5)
    top = [LABELS[int(i)].name for i in probs.argmax(axis=1)]
    assert top == ["pizza", "caesar_salad", "palak_paneer"]
    assert probs.max(axis=1).min() > 0.5
    assert clf.name == "siglip2-onnx:vision.onnx"


def test_embeddings_in_another_order_are_matched_by_name(tmp_path: Path) -> None:
    names = [c.name for c in LABELS.classes][::-1]
    clf = ZeroShotClassifier(FIXTURE, write_dishes(tmp_path / "d.npz", names), LABELS, threads=1)
    assert LABELS[int(clf.classify([solid((230, 20, 20))]).argmax())].name == "pizza"


def test_refuses_embeddings_that_miss_dishes(tmp_path: Path) -> None:
    names = [c.name for c in LABELS.classes][:-3]
    with pytest.raises(ModelLoadError, match="no embedding for 3 dishes"):
        ZeroShotClassifier(FIXTURE, write_dishes(tmp_path / "d.npz", names), LABELS)


def test_refuses_embeddings_of_another_size(tmp_path: Path) -> None:
    with pytest.raises(ModelLoadError, match="4-d embeddings"):
        ZeroShotClassifier(FIXTURE, write_dishes(tmp_path / "d.npz", dim=5), LABELS)


def models_dir(tmp_path: Path) -> Path:
    shutil.copy(FIXTURE, tmp_path / "siglip2_vision.onnx")
    write_dishes(tmp_path / "siglip2_dishes.npz")
    return tmp_path


def test_pipeline_without_a_detector_classifies_the_whole_photo(tmp_path: Path) -> None:
    settings = Settings(_env_file=None, env="test", models_dir=models_dir(tmp_path))  # type: ignore[call-arg]
    pipeline = build_pipeline(settings, LABELS)
    assert pipeline.detector.name == "none"
    result = pipeline.run(make_jpeg(640, 480, (230, 20, 20)))
    assert result.source == "full_image" and len(result.items) == 1
    assert LABELS[result.items[0].top[0].class_id].name == "pizza"


def test_detector_can_be_required(tmp_path: Path) -> None:
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None, env="test", models_dir=models_dir(tmp_path), detector_required=True
    )
    with pytest.raises(ModelLoadError, match="Detector not found"):
        build_pipeline(settings, LABELS)
