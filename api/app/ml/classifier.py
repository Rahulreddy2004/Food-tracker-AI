"""Food classifiers. `OnnxClassifier` runs `food101_EfficientNetV2B3_final.h5` exported to ONNX."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np
import numpy.typing as npt

from app.ml.image import resize
from app.ml.labels import LabelSet
from app.ml.runtime import ModelLoadError, load_session
from app.ml.structs import RGBImage

Probs = npt.NDArray[np.float32]


class Classifier(Protocol):
    name: str

    def classify(self, crops: list[RGBImage]) -> Probs:
        """Return class probabilities, shape (len(crops), num_classes)."""
        ...


def softmax(logits: npt.NDArray[np.float32]) -> Probs:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    return (exp / exp.sum(axis=1, keepdims=True)).astype(np.float32)


def as_probabilities(raw: npt.NDArray[np.float32]) -> Probs:
    """Accept either softmax output or logits."""
    sums = raw.sum(axis=1)
    if (raw >= 0).all() and np.allclose(sums, 1.0, atol=1e-3):
        return raw.astype(np.float32)
    return softmax(raw)


class OnnxClassifier:
    """EfficientNetV2-B3 (Keras, built-in preprocessing): raw 0–255 RGB, 300×300."""

    def __init__(self, path: Path, num_classes: int, threads: int = 2) -> None:
        self.session = load_session(path, threads)
        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        shape = list(inp.shape)
        self.channels_last = shape[-1] == 3
        spatial = shape[1:3] if self.channels_last else shape[2:4]
        self.size = spatial[0] if isinstance(spatial[0], int) else 300
        self.fixed_batch = shape[0] if isinstance(shape[0], int) else None
        out_shape = self.session.get_outputs()[0].shape
        if isinstance(out_shape[-1], int) and out_shape[-1] != num_classes:
            raise ModelLoadError(
                f"Classifier outputs {out_shape[-1]} classes but labels.json has {num_classes}"
            )
        self.name = f"efficientnetv2b3-onnx:{path.name}"

    def _prepare(self, crops: list[RGBImage]) -> npt.NDArray[np.float32]:
        batch = np.stack([resize(c, (self.size, self.size)) for c in crops]).astype(np.float32)
        return batch if self.channels_last else batch.transpose(0, 3, 1, 2)

    def classify(self, crops: list[RGBImage]) -> Probs:
        if not crops:
            return np.zeros((0, 0), dtype=np.float32)
        batch = self._prepare(crops)
        if self.fixed_batch == 1:
            outputs = [
                self.session.run(None, {self.input_name: batch[i : i + 1]})[0]
                for i in range(len(batch))
            ]
            raw = np.concatenate(outputs, axis=0)
        else:
            raw = self.session.run(None, {self.input_name: batch})[0]
        return as_probabilities(np.asarray(raw, dtype=np.float32))


class FakeClassifier:
    """Scripted classifier for tests and demos: crop i gets SCRIPT[i % len(SCRIPT)]."""

    name = "fake-classifier"

    SCRIPT: tuple[tuple[tuple[str, float], ...], ...] = (
        (("pizza", 0.82), ("garlic_bread", 0.09), ("lasagna", 0.04)),
        (("caesar_salad", 0.61), ("greek_salad", 0.22), ("caprese_salad", 0.08)),
        (("french_fries", 0.34), ("poutine", 0.31), ("onion_rings", 0.12)),
    )

    def __init__(self, labels: LabelSet) -> None:
        self.labels = labels

    def classify(self, crops: list[RGBImage]) -> Probs:
        n = len(self.labels)
        probs = np.zeros((len(crops), n), dtype=np.float32)
        for i in range(len(crops)):
            script = self.SCRIPT[i % len(self.SCRIPT)]
            rest = (1.0 - sum(p for _, p in script)) / (n - len(script))
            probs[i, :] = rest
            for name, p in script:
                food = self.labels.by_name(name)
                assert food is not None, name
                probs[i, food.id] = p
        return probs
