# Model card: Food Tracker AI

A detector finds each food on the plate and a classifier names it. The app always shows its top
three guesses, says when it is unsure, and lets people correct both the dish and the portion.

## 1. Food classifier: SigLIP 2 base (served)

| | |
|---|---|
| Model | [`google/siglip2-base-patch16-224`](https://huggingface.co/google/siglip2-base-patch16-224) (Apache-2.0), an image–text model; used zero-shot, with no food-specific training |
| How it names a dish | It embeds the photo and compares it with a text embedding of each dish's description (two prompt templates averaged, see `ml/dishes.py`). The probabilities are a softmax over all dishes. |
| Dishes | All 200 in `api/app/data/labels.json`: the 101 Food-101 dishes plus 99 more, mostly Indian, plus fruit and staples (`ml/vocab/extra_dishes.json`) |
| Adding a dish | Add it to `labels.json`, `nutrition.json` and `extra_dishes.json` (with a descriptive prompt), then rerun the Models workflow. No retraining. |
| Serving | ONNX Runtime: `siglip2_vision.onnx` (image encoder, 372 MB) and `siglip2_dishes.npz` (dish embeddings + preprocessing). 224 × 224 bilinear resize, scale to [-1, 1]. All crops of a photo go in one batch. |
| Speed | About 0.6 s for 4 dishes on 2 CPU threads (PyTorch on a GitHub runner; ONNX Runtime is similar or faster) |

### Accuracy

Top-1 is the share of photos where the app's first guess was right. Results are from the
**Compare models** workflow, on photos none of the models trained on:
- **Food-101:** 20 photos per dish from the test split, 2,020 photos
- **Indian-20:** the `rajistics/indian_food_images` test split, 941 photos of 20 dishes

| Model | Food-101 top-1 | Food-101 top-5 | Indian-20 top-1 |
|---|---|---|---|
| **SigLIP 2 base** (zero-shot, choosing among 200 dishes) | **90.5%** | **98.3%** | **84.3%** |
| CLIP ViT-B/16 (zero-shot, 200 dishes) | 85.4% | 97.1% | 72.4% |
| SigLIP 2 fine-tuned on Food-101 (community) | 91.4% | 98.6% | 17.2% |
| ViT fine-tuned on Food-101 (`nateraw/food`) | 90.1% | 97.8% | 17.1% |

- **Like-for-like with the Food-101 models.** When SigLIP 2 may choose only among the 101 Food-101
  dishes, it scores 92.3% on Food-101.
- **Why the Food-101 models fail on Indian food.** They can name only 4 of the 20 Indian-20
  dishes: burger, fried rice, pizza and samosa. Those cover 18.8% of its photos.
- **The larger model.** SigLIP 2 so400m scored about 4 points higher on a small sample. It needs
  about 19 s per scan on the API's CPUs, so it is not served.

Rerun the comparison any time from Actions → Compare models. It includes the `served` candidate,
which is the exact ONNX files and preprocessing the API uses.

## 2. Food detector: your YOLOv8 (`best.pt` → `best.onnx`, optional)

| | |
|---|---|
| Architecture | YOLOv8 (Ultralytics): one image in, boxes out |
| Job | Find each food on the plate; the classifier names each box |
| Serving | ONNX Runtime with a 640 × 640 letterbox. Class-agnostic NMS at IoU 0.45, confidence ≥ 0.25, at most 10 boxes. Boxes under 1% of the photo are dropped. |
| Without it | Each photo is classified as one dish (`source: "full_image"`). This also happens when the detector finds nothing. |

The Models workflow prints the detector's class names when it converts `best.pt`. The v1 portion
data mentions `palak_paneer`, `naan`, `white_rice` and `bhindi_masala`, which suggests the
detector was trained on Indian dishes.

## 3. Your EfficientNetV2-B3 classifier (`CLASSIFIER=efficientnet`, optional)

| | |
|---|---|
| Architecture | EfficientNetV2-B3 (Keras, built-in preprocessing): 300 × 300 RGB, raw 0–255 input |
| Dishes | The 101 Food-101 dishes, which are ids 0–100 in `labels.json` |
| Serving | `classifier.onnx` (exported by the Models workflow when the `.h5` is on the release) |

<!-- eval:start -->
_Not measured yet: the weights have not been published to the `models-v1` release. The Models
workflow compares it with SigLIP 2 on the same photos once they are._
<!-- eval:end -->

## Portions and nutrition

- **Portion estimate.** The formula is
  `grams = typical serving × (box area fraction ÷ reference fraction)`, clamped to 0.3–3×.
  - It doesn't depend on photo resolution.
  - A single photo cannot measure depth, so the UI always shows grams as an editable estimate.
  - With no detector, the typical serving is used.
  - See `docs/adr/0003-portion-estimation.md`.
- **Nutrition.** `api/app/data/nutrition.json` has per-100 g values and a typical serving for each
  of the 200 dishes.
  - The values assume typical home or restaurant preparations.
  - Each added dish's calories agree with its macros within 15%.
  - Refresh the table with `scripts/build_nutrition_table.py`.

## Limits and honest use

- **Look-alike dishes.** Dishes that look alike get confused, for example different dals, or
  curries in similar gravies. Low-confidence answers are flagged, and the top three are offered.
- **Dishes outside the 200.** SigLIP 2 names the closest one, usually with low confidence. Search
  is always available to log something else.
- **Photo conditions.** Many overlapping foods, unusual angles or poor light reduce accuracy.
- **Estimates only.** Calorie numbers are estimates, not medical advice.

## Conversion and checks

- **`ml/export_siglip.py`** exports the SigLIP 2 image encoder and builds the dish embeddings. It
  fails unless the served path agrees with PyTorch and the Hugging Face processor on sample photos:
  - same top dish
  - probabilities within 2e-3
- **`ml/export_onnx.py` and `ml/parity.py`** do the same for your YOLOv8 and EfficientNet:
  - boxes with IoU > 0.95
  - probabilities within 1e-3

The **Models** GitHub Action runs these checks and attaches the files to the release with their
checksums.
