#!/usr/bin/env python3
"""Evaluate the served classifier (ONNX + the API's own preprocessing) on the Food-101 test split.

    uv run python evaluate.py                 # all 25,250 test images (~15–30 min on CPU)
    uv run python evaluate.py --per-class 20  # quick check: 20 images per class

Reports top-1 / top-5 accuracy, per-class accuracy, the most confused pairs, a class-order sanity
check, and a suggested "ask the user" threshold. Results go to ml/results/eval.json and into the
EVAL section of ml/MODEL_CARD.md.
"""

from __future__ import annotations

import argparse
import io
import json
from collections import Counter
from pathlib import Path

import numpy as np
from tqdm import tqdm

from app.core.config import DATA_DIR
from app.ml.classifier import OnnxClassifier
from app.ml.image import decode_image
from app.ml.labels import LabelSet
from common import MODELS, ROOT

RESULTS = ROOT / "ml" / "results"
CARD = ROOT / "ml" / "MODEL_CARD.md"


def load_split(per_class: int | None):  # type: ignore[no-untyped-def]
    from datasets import load_dataset

    # ethz/food101: "validation" is the official 25,250-image test set (250 per class).
    ds = load_dataset("ethz/food101", split="validation")
    names = ds.features["label"].names
    if per_class:
        seen: Counter[int] = Counter()
        keep = []
        for i, label in enumerate(ds["label"]):
            if seen[label] < per_class:
                keep.append(i)
                seen[label] += 1
        ds = ds.select(keep)
    return ds, names


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--model", type=Path, default=MODELS / "classifier.onnx")
    parser.add_argument("--per-class", type=int, default=None)
    parser.add_argument("--batch", type=int, default=32)
    args = parser.parse_args()

    labels = LabelSet.load(DATA_DIR / "labels.json")
    clf = OnnxClassifier(args.model, num_classes=len(labels), threads=4)
    ds, ds_names = load_split(args.per_class)
    # Map dataset label ids to our model's output ids by *name*, so an order mismatch shows up.
    to_ours = {i: labels.by_name(n).id for i, n in enumerate(ds_names) if labels.by_name(n)}  # type: ignore[union-attr]

    y_true: list[int] = []
    probs: list[np.ndarray] = []
    batch_imgs: list[np.ndarray] = []
    for row in tqdm(ds, desc="evaluating"):
        buf = io.BytesIO()
        row["image"].convert("RGB").save(buf, format="JPEG", quality=95)
        batch_imgs.append(decode_image(buf.getvalue(), 1280))
        y_true.append(to_ours[row["label"]])
        if len(batch_imgs) == args.batch:
            probs.append(clf.classify(batch_imgs))
            batch_imgs = []
    if batch_imgs:
        probs.append(clf.classify(batch_imgs))
    p = np.concatenate(probs)
    y = np.array(y_true)

    top5 = np.argsort(p, axis=1)[:, ::-1][:, :5]
    pred = top5[:, 0]
    conf = p.max(axis=1)
    top1_acc = float((pred == y).mean())
    top5_acc = float((top5 == y[:, None]).any(axis=1).mean())

    per_class = {}
    confusions: Counter[tuple[int, int]] = Counter()
    for c in range(len(labels)):
        mask = y == c
        if mask.any():
            per_class[labels[c].name] = round(float((pred[mask] == c).mean()), 4)
    for t, pr in zip(y, pred, strict=True):
        if t != pr:
            confusions[(int(t), int(pr))] += 1

    # Class-order sanity check: two classes that are each mostly predicted as the other.
    swaps = []
    for (a, b), n in confusions.items():
        both_fail = (
            per_class.get(labels[a].name, 1) < 0.1 and per_class.get(labels[b].name, 1) < 0.1
        )
        if (
            a < b
            and both_fail
            and n > 0.5 * (y == a).sum()
            and confusions[(b, a)] > 0.5 * (y == b).sum()
        ):
            swaps.append((labels[a].name, labels[b].name))

    # Threshold for "ask the user": lowest confidence where confident answers are ≥ 85% right.
    thresholds = {}
    for t in np.arange(0.2, 0.95, 0.05):
        mask = conf >= t
        if mask.any():
            thresholds[round(float(t), 2)] = {
                "coverage": round(float(mask.mean()), 3),
                "accuracy": round(float((pred[mask] == y[mask]).mean()), 3),
            }
    suggested = next((t for t, v in thresholds.items() if v["accuracy"] >= 0.85), None)

    result = {
        "images": len(y),
        "top1": round(top1_acc, 4),
        "top5": round(top5_acc, 4),
        "worst_classes": sorted(per_class.items(), key=lambda kv: kv[1])[:10],
        "best_classes": sorted(per_class.items(), key=lambda kv: -kv[1])[:5],
        "most_confused": [
            {"true": labels[a].display, "predicted": labels[b].display, "count": n}
            for (a, b), n in confusions.most_common(10)
        ],
        "class_order_swaps": swaps,
        "confidence_thresholds": thresholds,
        "suggested_confirm_below": suggested,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "eval.json").write_text(json.dumps(result, indent=2) + "\n")

    print(f"\nTop-1 {top1_acc:.1%}   Top-5 {top5_acc:.1%}   on {len(y)} images")
    if swaps:
        print(
            f"⚠ Class order looks swapped for: {swaps}. Fix the order in api/app/data/labels.json."
        )
    print(f"Suggested CONFIRM_BELOW={suggested}")
    update_card(result)


def update_card(r: dict) -> None:  # type: ignore[type-arg]
    lines = [
        f"| Test images | {r['images']:,} (Food-101 test split) |",
        "|---|---|",
        f"| Top-1 accuracy | **{r['top1']:.1%}** |",
        f"| Top-5 accuracy | **{r['top5']:.1%}** |",
        f"| Suggested confirm threshold | {r['suggested_confirm_below']} |",
        "",
        "Hardest dishes: "
        + ", ".join(f"{n.replace('_', ' ')} ({a:.0%})" for n, a in r["worst_classes"][:5]),
        "",
        "Most confused: "
        + "; ".join(
            f"{c['true']} → {c['predicted']} ({c['count']})" for c in r["most_confused"][:5]
        ),
    ]
    text = CARD.read_text()
    start, end = "<!-- eval:start -->", "<!-- eval:end -->"
    before, rest = text.split(start, 1)
    _, after = rest.split(end, 1)
    CARD.write_text(f"{before}{start}\n" + "\n".join(lines) + f"\n{end}{after}")


if __name__ == "__main__":
    main()
