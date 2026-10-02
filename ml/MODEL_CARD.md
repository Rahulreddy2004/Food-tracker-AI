# Model card — Food Tracker AI

Two models work together. The app always shows its guesses and lets people correct them.

## 1. Food detector — `best.pt` → `best.onnx`

| | |
|---|---|
| Architecture | YOLOv8 (Ultralytics), single image in, boxes out |
| Job | Find each food item on the plate; the classifier names it |
| Serving | ONNX Runtime, 640 × 640 letterbox, class-agnostic NMS (IoU 0.45), confidence ≥ 0.25, max 10 boxes, boxes under 1% of the photo dropped |
| Fallback | If nothing is detected, the whole photo is classified as one item |

The detector's own class names are read from the ONNX metadata. The v1 portion data mentions
`palak_paneer`, `naan`, `white_rice` and `bhindi_masala`, which suggests it was trained on Indian
dishes. Once the weights are published, check `model.names` and consider passing those labels
through as extra guesses.

## 2. Food classifier — `food101_EfficientNetV2B3_final.h5` → `classifier.onnx`

| | |
|---|---|
| Architecture | EfficientNetV2-B3 (Keras, built-in preprocessing), 300 × 300 RGB, raw 0–255 input |
| Classes | The 101 dishes of [Food-101](https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/) (`api/app/data/labels.json`, index = model output) |
| Output | Softmax over 101 classes; the API returns the top 3 |
| Serving | ONNX Runtime, crops resized bilinearly, all crops of a photo in one batch |

### Accuracy (Food-101 test split)

Run `cd ml && uv run python evaluate.py` after the weights are available; this section is filled in
automatically.

<!-- eval:start -->
_Not measured yet — the weights have not been published to the `models-v1` release._
<!-- eval:end -->

## Portions and nutrition

* **Portion estimate:** `grams = typical serving × (box area fraction ÷ reference fraction)`,
  clamped to 0.3–3×. It is resolution-independent, but a single photo cannot measure depth, so
  the UI always shows grams as an editable estimate. See `docs/adr/0003-portion-estimation.md`.
* **Nutrition:** `api/app/data/nutrition_food101.json` has curated per-100 g values and a typical
  serving for every class (typical preparations; refresh with `scripts/build_nutrition_table.py`).

## Limits and honest use

* Food-101 is mostly Western restaurant dishes. Many regional foods (for example dal, dosa,
  palak paneer) are not among the 101 classes. The app flags low-confidence guesses and offers
  search instead of quietly logging a wrong dish.
* Photos with many overlapping foods, unusual angles or poor light reduce accuracy.
* Calorie numbers are estimates and are not medical advice.

## Conversion and parity

`ml/export_onnx.py` converts both models. `ml/parity.py` blocks an export unless:

* the classifier gives the same top-1 class with probabilities within 1e-3, and
* every detector box has a matching ONNX box with IoU > 0.95.

The **Models** GitHub Action runs both steps and attaches the ONNX files to the release.
