#!/usr/bin/env python3
"""Build what the API serves for SigLIP 2: the image encoder as ONNX + one text embedding per dish.

    uv run python export_siglip.py [--model google/siglip2-base-patch16-224] [--out ../api/models]

Writes
  siglip2_vision.onnx   pixel_values [N, 3, S, S] -> image_embeds [N, D]
  siglip2_dishes.npz    dish names (labels.json order), normalised text embeddings, logit
                        scale/bias, and the image preprocessing the API must apply

Then checks the served classifier (app.ml.classifier.ZeroShotClassifier: ONNX + the API's own
numpy preprocessing) against PyTorch + the Hugging Face processor on sample photos, and exits
non-zero if their probabilities differ by more than --atol or their top dish differs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from common import API, MODELS, sha256

from app.core.config import DATA_DIR
from app.ml.classifier import ZeroShotClassifier
from app.ml.image import decode_image
from app.ml.labels import LabelSet
from dishes import TEMPLATES, Vocab

MODEL_ID = "google/siglip2-base-patch16-224"
PIL_RESAMPLE = {
    int(Image.Resampling.BILINEAR): "bilinear",
    int(Image.Resampling.BICUBIC): "bicubic",
}


def text_embeddings(model, processor, vocab: Vocab):  # type: ignore[no-untyped-def]
    """Mean of the per-template embeddings for each dish, renormalised (as compare.py scores)."""
    import torch

    def encode(texts: list[str]):  # type: ignore[no-untyped-def]
        out = []
        for i in range(0, len(texts), 64):
            tok = processor(
                text=texts[i : i + 64], padding="max_length", max_length=64, truncation=True,
                return_tensors="pt",
            )  # fmt: skip
            feats = model.get_text_features(input_ids=tok["input_ids"])
            out.append(torch.nn.functional.normalize(feats, dim=-1))
        return torch.cat(out)

    per_template = torch.stack([encode(vocab.texts(t)) for t in TEMPLATES])
    return torch.nn.functional.normalize(per_template.mean(0), dim=-1).numpy().astype(np.float32)


def export_vision(model, size: int, target: Path) -> None:  # type: ignore[no-untyped-def]
    import torch

    class Vision(torch.nn.Module):
        def __init__(self, inner) -> None:  # type: ignore[no-untyped-def]
            super().__init__()
            self.inner = inner

        def forward(self, pixel_values):  # type: ignore[no-untyped-def]
            return self.inner.get_image_features(pixel_values=pixel_values)

    vision = Vision(model).eval()
    example = (torch.zeros(2, 3, size, size),)
    try:  # the current exporter (torch.export based)
        program = torch.onnx.export(
            vision,
            example,
            input_names=["pixel_values"],
            output_names=["image_embeds"],
            dynamic_shapes={"pixel_values": {0: torch.export.Dim("batch", min=1, max=64)}},
            dynamo=True,
        )
        program.save(str(target), external_data=False)
    except Exception as exc:  # older torch, or an op the new exporter cannot handle yet
        print(f"dynamo export failed ({type(exc).__name__}: {exc}); using the TorchScript exporter")
        torch.onnx.export(
            vision,
            example,
            str(target),
            input_names=["pixel_values"],
            output_names=["image_embeds"],
            dynamic_axes={"pixel_values": {0: "batch"}, "image_embeds": {0: "batch"}},
            opset_version=17,
            dynamo=False,
        )


def sample_photos(count: int = 12) -> list[np.ndarray]:
    """The fixture photo plus random crops of it (different sizes and aspect ratios)."""
    photo = decode_image((API / "tests" / "fixtures" / "palak_paneer.jpg").read_bytes(), 1280)
    rng = np.random.default_rng(7)
    h, w = photo.shape[:2]
    crops = [photo]
    for _ in range(count):
        cw, ch = int(rng.integers(w // 4, w)), int(rng.integers(h // 4, h))
        x, y = int(rng.integers(0, w - cw + 1)), int(rng.integers(0, h - ch + 1))
        crops.append(np.ascontiguousarray(photo[y : y + ch, x : x + cw]))
    return crops


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--out", type=Path, default=MODELS)
    parser.add_argument("--atol", type=float, default=2e-3, help="max |Δp| served vs PyTorch")
    args = parser.parse_args()

    import torch
    from transformers import AutoModel, AutoProcessor

    torch.set_grad_enabled(False)
    model = AutoModel.from_pretrained(args.model).eval()
    processor = AutoProcessor.from_pretrained(args.model, use_fast=False)
    revision = getattr(model.config, "_commit_hash", None) or "unknown"
    ip = processor.image_processor
    size = int(ip.size["height"])
    if not (ip.do_resize and ip.do_rescale and ip.do_normalize) or ip.size["width"] != size:
        raise SystemExit(f"unexpected preprocessing for {args.model}: {ip}")
    resample = PIL_RESAMPLE.get(int(ip.resample))
    if resample is None:
        raise SystemExit(f"unsupported resample filter {ip.resample}")
    stats = f"mean {ip.image_mean}, std {ip.image_std}"
    print(f"{args.model}@{revision[:12]}: {size}px, {resample} resize, {stats}")

    vocab = Vocab.load()
    text = text_embeddings(model, processor, vocab)
    args.out.mkdir(parents=True, exist_ok=True)
    dishes = args.out / "siglip2_dishes.npz"
    np.savez(
        dishes,
        names=np.array(vocab.keys),
        embeddings=text,
        logit_scale=np.float32(model.logit_scale.exp().item()),
        logit_bias=np.float32(model.logit_bias.item()),
        image_size=np.int32(size),
        mean=np.asarray(ip.image_mean, np.float32),
        std=np.asarray(ip.image_std, np.float32),
        rescale=np.float32(ip.rescale_factor),
        resample=np.array(resample),
        model_id=np.array(args.model),
        revision=np.array(revision),
        templates=np.array(TEMPLATES),
    )
    vision = args.out / "siglip2_vision.onnx"
    export_vision(model, size, vision)
    print(f"wrote {vision.name} ({vision.stat().st_size / 1e6:.0f} MB) and {dishes.name}")

    # Served path vs reference path on the same photos.
    labels = LabelSet.load(DATA_DIR / "labels.json")
    served = ZeroShotClassifier(vision, dishes, labels, threads=4)
    photos = sample_photos()
    got = served.classify(photos)
    pixels = processor(images=[Image.fromarray(p) for p in photos], return_tensors="pt")
    img = torch.nn.functional.normalize(model.get_image_features(**pixels), dim=-1).numpy()
    logits = img @ text.T * model.logit_scale.exp().item() + model.logit_bias.item()
    ref = np.exp(logits - logits.max(axis=1, keepdims=True))
    ref /= ref.sum(axis=1, keepdims=True)
    same_top = bool((ref.argmax(1) == got.argmax(1)).all())
    max_diff = float(np.abs(ref - got).max())
    top3 = [labels[int(i)].display for i in np.argsort(got[0])[::-1][:3]]
    print(f"parity: {len(photos)} photos, same top dish: {same_top}, max |Δp| = {max_diff:.2e}")
    print(f"fixture photo (palak paneer): {top3}")

    print(json.dumps({"serving": {p.name: sha256(p) for p in (vision, dishes)}}, indent=2))
    ok = same_top and max_diff <= args.atol
    print("PARITY OK" if ok else "PARITY FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
