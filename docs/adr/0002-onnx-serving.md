# ADR 0002: Serve the same models with ONNX Runtime

**Status:** accepted · **Date:** 2026-10-02

## Context

The detector (`best.pt`, YOLOv8 in PyTorch) and the classifier
(`food101_EfficientNetV2B3_final.h5`, Keras) need PyTorch *and* TensorFlow at runtime. A serving
image with both is about 4 GB, which makes cold starts on Cloud Run slow and costly.

## Decision

- Export both models to ONNX once (`ml/export_onnx.py`, run by the `models.yml` workflow) and serve
  them with `onnxruntime`. The weights stay the same; only the runtime changes.
- `ml/parity.py` must pass before an export is used. It requires:
  - the same top-1 class
  - probabilities within 1e-3
  - detector boxes with IoU > 0.95
- Pre- and post-processing (letterbox, NMS, resize, softmax) live in `api/app/ml/` and are
  unit-tested with small synthetic ONNX graphs, so CI never needs the real weights.

## Consequences

- The API image is small (no TF or PyTorch) and starts quickly.
- If an export ever fails parity, we would ship the native runtimes instead, accepting the bigger
  image. The detector and classifier interfaces make that a contained change.
