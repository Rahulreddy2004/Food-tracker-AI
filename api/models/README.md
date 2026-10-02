# Model files

Weights are not stored in git. They live as assets on the GitHub Release `models-v1`.

| File | What it is | Used by |
|---|---|---|
| `siglip2_vision.onnx` | SigLIP 2 base image encoder (the classifier) | the API (required) |
| `siglip2_dishes.npz` | One SigLIP 2 text embedding per dish in `labels.json`, plus preprocessing | the API (required) |
| `best.onnx` | Your YOLOv8 detector exported to ONNX | the API (optional; without it each photo is one dish) |
| `classifier.onnx` | Your EfficientNetV2-B3 Food-101 classifier exported to ONNX | the API with `CLASSIFIER=efficientnet` |
| `best.pt` | Your YOLOv8 detector (original) | `ml/` conversion and parity checks |
| `food101_EfficientNetV2B3_final.h5` | Your EfficientNetV2-B3 classifier (original) | `ml/` conversion and parity checks |

```bash
python scripts/fetch_models.py              # files for the API (optional ones if published)
python scripts/fetch_models.py --originals  # best.pt and the .h5, for ml/
```

All the ONNX files are produced by the **Models** GitHub Action (`.github/workflows/models.yml`).
It exports SigLIP 2 from Hugging Face and converts your originals when they are on the release.
Each export is checked against the original framework before it is uploaded, together with its
checksum in `SHA256SUMS`.
