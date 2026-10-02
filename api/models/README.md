# Model files

Weights are not stored in git. They live as assets on the GitHub Release `models-v1`.

| File | What it is | Used by |
|---|---|---|
| `best.pt` | YOLOv8 food detector (original) | `ml/` conversion and parity checks |
| `food101_EfficientNetV2B3_final.h5` | EfficientNetV2-B3 Food-101 classifier (original) | `ml/` conversion and parity checks |
| `best.onnx` | The detector exported to ONNX | the API |
| `classifier.onnx` | The classifier exported to ONNX | the API |

```bash
python scripts/fetch_models.py              # ONNX files for the API
python scripts/fetch_models.py --originals  # originals, for ml/
```

The ONNX files are produced by the **Models** GitHub Action (`.github/workflows/models.yml`).
It downloads the originals, converts them, checks that both versions give the same results,
and uploads the ONNX files plus their checksums back to the release.
