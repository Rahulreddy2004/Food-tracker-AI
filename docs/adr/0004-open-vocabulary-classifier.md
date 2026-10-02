# ADR 0004: SigLIP 2 base as the classifier (open vocabulary)

**Status:** accepted · **Date:** 2026-10-02

## Context

The v1 classifier (EfficientNetV2-B3 on Food-101) only knows 101 mostly Western dishes. The app's
users eat a lot of Indian food, such as palak paneer, dal, naan and dosa, and none of those are
among the 101. A closed-set model can only guess the nearest Western dish.

The **Compare models** workflow (`ml/compare.py`) scored candidates on the same unseen photos:
- 2,020 Food-101 test photos
- 941 Indian-food test photos (`rajistics/indian_food_images`)

| | Food-101 top-1 | Indian-20 top-1 | CPU per scan |
|---|---|---|---|
| SigLIP 2 base, zero-shot over 200 dishes | 90.5% | 84.3% | ~0.6 s |
| Best Food-101 fine-tune (SigLIP 2) | 91.4% | 17.2% | ~0.6 s |
| SigLIP 2 so400m, zero-shot (small sample) | ~94.5% | ~88% | ~19 s |

## Decision

- Serve **`google/siglip2-base-patch16-224`** zero-shot:
  - The image encoder is exported to ONNX.
  - The text embedding of every dish is precomputed offline (`ml/export_siglip.py`), so no text
    model runs in the API.
- Grow the dish list to 200. Ids 0–100 stay Food-101, so the EfficientNet remains usable with
  `CLASSIFIER=efficientnet`.
- Make the detector optional. Without one, each photo is classified as one dish.

## Consequences

- **Indian dishes.** They are named correctly most of the time instead of never, at almost no
  cost on Food-101.
- **New dishes.** Adding one means a label, a nutrition entry and a prompt, with no retraining.
  The comparison workflow measures the effect.
- **Image size.** The API image grows by about 370 MB, and a scan takes about 0.6 s on Cloud
  Run's 2 vCPUs. The previous classifier took about 0.15 s. Int8 quantisation is the next step
  if latency matters.
- **Confidence values.** These are a softmax over 200 dishes, so `CONFIRM_BELOW` is tuned on this
  model's own confidence-vs-accuracy table, which the comparison report includes.
- **Licences.** SigLIP 2 is Apache-2.0. Ultralytics YOLOv8 is AGPL-3.0, which is fine while this
  repository is public.
