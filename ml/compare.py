#!/usr/bin/env python3
"""Compare food classifiers on the same test photos, to decide what the API should serve.

    uv run python compare.py                         # 20 Food-101 photos per class + Indian-20
    uv run python compare.py --per-class 250         # the full 25,250-photo Food-101 test set
    uv run python compare.py --candidates yours,siglip2-base

Candidates
  served           what the API serves: SigLIP 2 base as ONNX + dish embeddings (api/models)
  yours            your EfficientNetV2-B3 (classifier.onnx, else the .h5); Food-101 classes only
  siglip2-base     google/siglip2-base-patch16-224, zero-shot over all dishes
  siglip2-so400m   google/siglip2-so400m-patch14-384, zero-shot (opt-in: far too slow for CPU)
  clip-b16         openai/clip-vit-base-patch16, zero-shot (reference point)
  vit-food101      nateraw/food, a ViT fine-tuned on Food-101
  siglip2-food101  prithivMLmods/Food-101-93M, SigLIP 2 fine-tuned on Food-101

Test sets
  food101   ethz/food101 test split ("validation" on Hugging Face), the first N photos per class
  indian20  rajistics/indian_food_images test split: 941 photos of 20 Indian and street foods

All models are scored against the same labels. Zero-shot models choose among every dish the app
would know (Food-101 + ml/vocab/extra_dishes.json), just as they would in the app. Food-101 models
can only answer with their 101 classes, so they can never be right about other dishes; "coverage"
is the share of test photos whose dish a model can name at all.

Writes ml/results/compare.json and ml/results/compare.md (also printed).
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import statistics
import time
import traceback
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import numpy as np
from PIL import Image

from common import MODELS, ROOT

from dishes import EXTRA, TEMPLATES, Vocab

RESULTS = ROOT / "ml" / "results"
BENCH_CROPS = 4  # a typical scan: a few dishes on one plate
BENCH_THREADS = 2  # Cloud Run instance size (infra/cloudrun/service.yaml)


# --- Test sets --------------------------------------------------------------------------------


@dataclass
class TestSet:
    name: str
    title: str
    source: str
    labels: list[str]  # canonical true label per photo
    batches: Any  # callable(batch_size) -> iterator of list[PIL.Image]

    def __len__(self) -> int:
        return len(self.labels)

    def images(self, batch_size: int) -> Iterator[list[Image.Image]]:
        return self.batches(batch_size)


def _hf_test_set(
    name: str, title: str, repo: str, split: str, per_class: int | None, vocab: Vocab
) -> TestSet:
    import io

    from datasets import Image as ImageFeature
    from datasets import load_dataset

    # Stream just this split (Food-101's training split alone is ~5 GB) and keep the encoded
    # photos; they are decoded batch by batch while scoring.
    stream = load_dataset(repo, split=split, streaming=True)
    names = (stream.features or stream.info.features)["label"].names
    stream = stream.cast_column("image", ImageFeature(decode=False))
    photos: list[bytes] = []
    label_ids: list[int] = []
    seen: Counter[int] = Counter()
    for row in stream:
        label = row["label"]
        if per_class and seen[label] >= per_class:
            continue
        seen[label] += 1
        photos.append(row["image"]["bytes"])
        label_ids.append(label)
        if per_class and len(seen) == len(names) and min(seen.values()) >= per_class:
            break  # every class is full; no need to read the rest of the split
    labels = [vocab.resolve(names[i]) for i in label_ids]
    unknown = sorted({lab for lab in labels if lab not in vocab.display})
    if unknown:
        raise SystemExit(f"{name}: add these dishes (or aliases) to {EXTRA.name}: {unknown}")

    def batches(size: int) -> Iterator[list[Image.Image]]:
        for i in range(0, len(photos), size):
            yield [Image.open(io.BytesIO(b)).convert("RGB") for b in photos[i : i + size]]

    return TestSet(name, title, f"{repo} [{split}]", labels, batches)


def load_test_sets(per_class: int, indian_per_class: int | None, vocab: Vocab) -> list[TestSet]:
    return [
        _hf_test_set("food101", "Food-101", "ethz/food101", "validation", per_class, vocab),
        _hf_test_set(
            "indian20", "Indian-20", "rajistics/indian_food_images", "test", indian_per_class, vocab
        ),
    ]


# --- Candidates -------------------------------------------------------------------------------


class Unavailable(Exception):  # noqa: N818  (a reason to skip, not an error)
    pass


class Candidate(Protocol):
    name: str
    model_id: str
    kind: str
    labels: list[str]  # canonical key of each output column
    size_mb: float

    def scores(self, images: list[Image.Image]) -> np.ndarray: ...


def _softmax(x: np.ndarray) -> np.ndarray:
    z = np.exp(x - x.max(axis=1, keepdims=True))
    return z / z.sum(axis=1, keepdims=True)


class Yours:
    """The served classifier: same ONNX file and preprocessing as the API."""

    kind = "Food-101 classifier (yours)"

    def __init__(self, vocab: Vocab) -> None:
        self.name = "yours"
        self.labels = vocab.food101
        onnx = MODELS / "classifier.onnx"
        h5 = MODELS / "food101_EfficientNetV2B3_final.h5"
        if onnx.is_file():
            from app.ml.classifier import OnnxClassifier

            self.model_id = "EfficientNetV2-B3 (classifier.onnx)"
            self._onnx = OnnxClassifier(onnx, num_classes=len(self.labels), threads=BENCH_THREADS)
            self.size_mb = onnx.stat().st_size / 1e6
            self._keras = None
        elif h5.is_file():
            from common import load_keras

            self.model_id = "EfficientNetV2-B3 (.h5)"
            self._keras = load_keras(h5)
            self._size = int(self._keras.input_shape[1] or 300)
            self.size_mb = h5.stat().st_size / 1e6
        else:
            raise Unavailable("weights are not on the models-v1 release yet")

    def scores(self, images: list[Image.Image]) -> np.ndarray:
        arrays = [np.asarray(im, dtype=np.uint8) for im in images]
        if self._keras is None:
            return self._onnx.classify(arrays)
        from app.ml.image import resize

        batch = np.stack([resize(a, (self._size, self._size)) for a in arrays]).astype(np.float32)
        return np.asarray(self._keras.predict(batch, verbose=0), dtype=np.float32)


def _torch_size_mb(module: Any) -> float:
    return sum(p.numel() * p.element_size() for p in module.parameters()) / 1e6


class ZeroShot:
    """Image–text model: compares each photo with a text prompt per dish (no food training)."""

    def __init__(self, name: str, model_id: str, vocab: Vocab) -> None:
        import torch
        from transformers import AutoModel, AutoProcessor

        self.name, self.model_id = name, model_id
        self.kind = f"zero-shot over {len(vocab.keys)} dishes"
        self.labels = vocab.keys
        self.model = AutoModel.from_pretrained(model_id).eval()
        # The slow processors are the ones these models were evaluated with.
        self.processor = AutoProcessor.from_pretrained(model_id, use_fast=False)
        self.siglip = "siglip" in self.model.config.model_type
        # Only the image tower would be served; the dish embeddings are computed once, offline.
        self.size_mb = _torch_size_mb(self.model.vision_model)
        with torch.inference_mode():
            per_template = [self._encode_text(vocab.texts(t)) for t in TEMPLATES]
            text = torch.stack(per_template).mean(0)
            self.text = torch.nn.functional.normalize(text, dim=-1)
        self.scale = float(self.model.logit_scale.detach().exp())
        bias = getattr(self.model, "logit_bias", None)
        self.bias = float(bias.detach()) if bias is not None else 0.0

    def _encode_text(self, texts: list[str]) -> Any:
        import torch

        out = []
        for i in range(0, len(texts), 64):
            chunk = texts[i : i + 64]
            if self.siglip:  # SigLIP was trained on text padded to 64 tokens
                tok = self.processor(
                    text=chunk,
                    padding="max_length",
                    max_length=64,
                    truncation=True,
                    return_tensors="pt",
                )
                feats = self.model.get_text_features(input_ids=tok["input_ids"])
            else:
                tok = self.processor(text=chunk, padding=True, truncation=True, return_tensors="pt")
                feats = self.model.get_text_features(
                    input_ids=tok["input_ids"], attention_mask=tok["attention_mask"]
                )
            out.append(torch.nn.functional.normalize(feats, dim=-1))
        return torch.cat(out)

    def scores(self, images: list[Image.Image]) -> np.ndarray:
        import torch

        with torch.inference_mode():
            # All processor outputs: SigLIP 2's variable-resolution models also need spatial shapes.
            inputs = self.processor(images=images, return_tensors="pt")
            img = self.model.get_image_features(**inputs)
            img = torch.nn.functional.normalize(img, dim=-1)
            logits = (img @ self.text.T) * self.scale + self.bias
        return _softmax(logits.numpy().astype(np.float64)).astype(np.float32)


class Served:
    """Exactly what the API runs: ZeroShotClassifier on the files in api/models."""

    kind = "zero-shot, as served (ONNX)"

    def __init__(self, vocab: Vocab) -> None:
        from app.core.config import DATA_DIR
        from app.ml.classifier import ZeroShotClassifier
        from app.ml.labels import LabelSet

        self.name = "served"
        model, dishes = MODELS / "siglip2_vision.onnx", MODELS / "siglip2_dishes.npz"
        if not (model.is_file() and dishes.is_file()):
            raise Unavailable("siglip2_vision.onnx is not on the models-v1 release yet")
        self.model_id = f"SigLIP 2 ({model.name})"
        self.labels = vocab.keys
        self._clf = ZeroShotClassifier(model, dishes, LabelSet.load(DATA_DIR / "labels.json"))
        self.size_mb = model.stat().st_size / 1e6

    def scores(self, images: list[Image.Image]) -> np.ndarray:
        return self._clf.classify([np.asarray(im, dtype=np.uint8) for im in images])


class FineTuned:
    """A classifier someone fine-tuned on Food-101 and shared on Hugging Face."""

    kind = "Food-101 classifier (community)"

    def __init__(self, name: str, model_id: str, vocab: Vocab) -> None:
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        self.name, self.model_id = name, model_id
        self.model = AutoModelForImageClassification.from_pretrained(model_id).eval()
        self.processor = AutoImageProcessor.from_pretrained(model_id, use_fast=False)
        id2label = self.model.config.id2label
        self.labels = [vocab.resolve(id2label[i]) for i in range(len(id2label))]
        unknown = [lab for lab in self.labels if lab not in vocab.display]
        if len(unknown) > len(self.labels) // 2:
            raise Unavailable(f"its label names don't match Food-101 (e.g. {unknown[:3]})")
        self.size_mb = _torch_size_mb(self.model)

    def scores(self, images: list[Image.Image]) -> np.ndarray:
        import torch

        with torch.inference_mode():
            inputs = self.processor(images=images, return_tensors="pt")
            logits = self.model(**inputs).logits
        return _softmax(logits.numpy().astype(np.float64)).astype(np.float32)


CANDIDATES: dict[str, Any] = {
    "served": lambda v: Served(v),
    "yours": lambda v: Yours(v),
    "siglip2-base": lambda v: ZeroShot("siglip2-base", "google/siglip2-base-patch16-224", v),
    "siglip2-so400m": lambda v: ZeroShot("siglip2-so400m", "google/siglip2-so400m-patch14-384", v),
    "clip-b16": lambda v: ZeroShot("clip-b16", "openai/clip-vit-base-patch16", v),
    "vit-food101": lambda v: FineTuned("vit-food101", "nateraw/food", v),
    "siglip2-food101": lambda v: FineTuned("siglip2-food101", "prithivMLmods/Food-101-93M", v),
}


# siglip2-so400m is opt-in: ~5 s per photo on a 4-core runner, ~19 s per scan on Cloud Run's CPUs.
DEFAULT_CANDIDATES = [name for name in CANDIDATES if name != "siglip2-so400m"]


# --- Scoring ----------------------------------------------------------------------------------


def predict(cand: Candidate, test: TestSet, batch_size: int) -> np.ndarray:
    """Probabilities for every photo, shape (photos, outputs)."""
    return np.concatenate([cand.scores(images) for images in test.images(batch_size)])


def metrics(
    probs: np.ndarray,
    outputs: list[str],
    test: TestSet,
    vocab: Vocab,
    restrict: list[str] | None = None,
) -> dict[str, Any]:
    """Top-1/top-5 against canonical labels; `restrict` limits the choices (e.g. to Food-101)."""
    columns = np.arange(len(outputs))
    if restrict is not None:
        allowed = set(restrict)
        columns = np.array([i for i, lab in enumerate(outputs) if lab in allowed])
    p = probs[:, columns]
    p = p / p.sum(axis=1, keepdims=True)
    out_labels = np.array(outputs, dtype=object)[columns]
    top = np.argsort(p, axis=1)[:, ::-1][:, :5]
    top5 = out_labels[top]
    confidence = p[np.arange(len(p)), top[:, 0]]
    truth = np.array(test.labels, dtype=object)
    hit1 = top5[:, 0] == truth
    hit5 = (top5 == truth[:, None]).any(axis=1)
    covered = np.isin(truth, out_labels)

    per_class = {
        lab: round(float(hit1[truth == lab].mean()), 3) for lab in sorted(set(test.labels))
    }
    confused = Counter(
        (vocab.display.get(t, t), vocab.display.get(pr, pr))
        for t, pr, ok in zip(truth, top5[:, 0], hit1, strict=True)
        if not ok
    )
    thresholds = {}
    for t in np.round(np.arange(0.1, 0.95, 0.1), 1):
        mask = confidence >= t
        if mask.any():
            thresholds[f"{t:.1f}"] = {
                "answered": round(float(mask.mean()), 3),
                "accuracy": round(float(hit1[mask].mean()), 3),
            }
    return {
        "images": len(truth),
        "top1": round(float(hit1.mean()), 4),
        "top5": round(float(hit5.mean()), 4),
        "coverage": round(float(covered.mean()), 4),
        "top1_where_covered": round(float(hit1[covered].mean()), 4) if covered.any() else None,
        "worst_classes": sorted(per_class.items(), key=lambda kv: kv[1])[:8],
        "most_confused": [
            {"true": t, "predicted": pr, "count": n} for (t, pr), n in confused.most_common(8)
        ],
        "confidence": thresholds,
    }


def bench(cand: Candidate, images: list[Image.Image]) -> float:
    """Median milliseconds to classify one scan's crops on Cloud Run's 2 threads."""
    try:
        import torch

        before = torch.get_num_threads()
        torch.set_num_threads(BENCH_THREADS)
    except ImportError:
        torch, before = None, 0
    try:
        for _ in range(2):
            cand.scores(images)
        runs = []
        for _ in range(5):
            start = time.perf_counter()
            cand.scores(images)
            runs.append((time.perf_counter() - start) * 1000)
        return round(statistics.median(runs), 1)
    finally:
        if torch is not None:
            torch.set_num_threads(before)


def evaluate(name: str, tests: list[TestSet], vocab: Vocab, batch_size: int) -> dict[str, Any]:
    entry: dict[str, Any] = {"name": name}
    try:
        cand: Candidate = CANDIDATES[name](vocab)
    except Unavailable as why:
        entry["skipped"] = str(why)
        return entry
    except Exception as exc:
        entry["error"] = f"could not load: {type(exc).__name__}: {exc}"
        traceback.print_exc()
        return entry
    entry |= {"model_id": cand.model_id, "kind": cand.kind, "outputs": len(cand.labels)}
    entry["size_mb"] = round(cand.size_mb, 1)
    entry["results"] = {}
    try:
        for test in tests:
            started = time.perf_counter()
            probs = predict(cand, test, batch_size)
            took = time.perf_counter() - started
            entry["results"][test.name] = metrics(probs, cand.labels, test, vocab)
            entry["results"][test.name]["ms_per_photo"] = round(1000 * took / len(test), 1)
            if test.name == "food101" and len(cand.labels) > len(vocab.food101):
                entry["results"]["food101_only"] = metrics(
                    probs, cand.labels, test, vocab, restrict=vocab.food101
                )
            print(f"  {test.title}: top-1 {entry['results'][test.name]['top1']:.1%} ({took:.0f}s)")
        sample = next(tests[0].images(BENCH_CROPS))
        entry["ms_per_scan"] = bench(cand, sample)
    except Exception as exc:
        entry["error"] = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
    finally:
        del cand
        gc.collect()
    return entry


# --- Report -----------------------------------------------------------------------------------


def _pct(value: float | None) -> str:
    return "–" if value is None else f"{value:.1%}"


def render(report: dict[str, Any]) -> str:
    tests = {t["name"]: t for t in report["test_sets"]}
    lines = [
        "## Food classifier comparison",
        "",
        " · ".join(
            f"**{t['title']}**: {t['images']:,} photos, {t['classes']} dishes"
            for t in tests.values()
        )
        + f" · scored against {report['vocabulary']} dishes",
        "",
        "| Model | Type | Food-101 top-1 | Food-101 top-5 | Indian-20 top-1 | Indian-20 coverage "
        "| ms per scan¹ | Size² |",
        "|---|---|---|---|---|---|---|---|",
    ]
    ranked = sorted(
        report["candidates"],
        key=lambda c: (
            -(c.get("results", {}).get("indian20", {}).get("top1", -1))
            - (c.get("results", {}).get("food101", {}).get("top1", -1))
        ),
    )
    notes = []
    for c in ranked:
        if "results" not in c or "error" in c:
            notes.append(f"- **{c['name']}**: {c.get('skipped') or c.get('error')}")
            if "results" not in c:
                continue
        f = c["results"].get("food101", {})
        i = c["results"].get("indian20", {})
        lines.append(
            f"| **{c['name']}**<br>`{c['model_id']}` | {c['kind']} | {_pct(f.get('top1'))} "
            f"| {_pct(f.get('top5'))} | {_pct(i.get('top1'))} | {_pct(i.get('coverage'))} "
            f"| {c.get('ms_per_scan', '–')} | {c['size_mb']:.0f} MB |"
        )
    lines += [
        "",
        f"¹ {BENCH_CROPS} dish crops on {BENCH_THREADS} CPU threads, about one scan on the API's "
        "Cloud Run instance (indicative: PyTorch or ONNX Runtime on a GitHub runner).",
        "² Weights that would be served (for zero-shot models, the image tower only).",
    ]
    zero = [c for c in ranked if "food101_only" in c.get("results", {})]
    if zero:
        lines += [
            "",
            "Zero-shot models above choose among every dish. Limited to the 101 Food-101 dishes "
            "(a like-for-like comparison with the Food-101 classifiers), they score: "
            + ", ".join(f"{c['name']} {_pct(c['results']['food101_only']['top1'])}" for c in zero)
            + ".",
        ]
    open_vocab = [c for c in ranked if c.get("results") and c.get("outputs", 0) > 101]
    if open_vocab:
        cuts = ["0.3", "0.5", "0.7"]
        lines += [
            "",
            "**How sure, how right** (open-vocabulary models): share of photos answered with at "
            "least this confidence · accuracy of those answers. The app asks the user to confirm "
            "below its threshold (CONFIRM_BELOW).",
            "",
            "| Model | Test set | " + " | ".join(f"≥ {t}" for t in cuts) + " |",
            "|---|---|" + "---|" * len(cuts),
        ]
        for c in open_vocab:
            for key, title in (("food101", "Food-101"), ("indian20", "Indian-20")):
                conf = c["results"].get(key, {}).get("confidence", {})
                cells = [
                    f"{conf[t]['answered']:.0%} · {conf[t]['accuracy']:.1%}" if t in conf else "–"
                    for t in cuts
                ]
                lines.append(f"| {c['name']} | {title} | " + " | ".join(cells) + " |")
    if notes:
        lines += ["", "**Not compared**", *notes]
    lines += ["", f"_{report['generated']} · details in compare.json_", ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--per-class", type=int, default=20, help="Food-101 photos per class")
    parser.add_argument("--indian-per-class", type=int, default=None, help="default: all")
    parser.add_argument("--candidates", default=",".join(DEFAULT_CANDIDATES))
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    args = parser.parse_args()

    names = [n.strip() for n in args.candidates.split(",") if n.strip()]
    unknown = [n for n in names if n not in CANDIDATES]
    if unknown:
        raise SystemExit(f"unknown candidates {unknown}; choose from {list(CANDIDATES)}")
    try:
        import torch

        torch.set_num_threads(args.threads)
    except ImportError:
        pass

    vocab = Vocab.load()
    tests = load_test_sets(args.per_class, args.indian_per_class, vocab)
    for t in tests:
        print(f"{t.title}: {len(t):,} photos of {len(set(t.labels))} dishes from {t.source}")

    report: dict[str, Any] = {
        "generated": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "vocabulary": len(vocab.keys),
        "settings": {"per_class": args.per_class, "indian_per_class": args.indian_per_class},
        "test_sets": [
            {
                "name": t.name,
                "title": t.title,
                "source": t.source,
                "images": len(t),
                "classes": len(set(t.labels)),
            }
            for t in tests
        ],
        "candidates": [],
    }
    for name in names:
        print(f"\n▸ {name}")
        report["candidates"].append(evaluate(name, tests, vocab, args.batch))

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "compare.json").write_text(json.dumps(report, indent=2) + "\n")
    markdown = render(report)
    (RESULTS / "compare.md").write_text(markdown)
    print("\n" + markdown)
    if not any("results" in c and "error" not in c for c in report["candidates"]):
        raise SystemExit("no candidate could be evaluated")


if __name__ == "__main__":
    main()
