"""ONNX Runtime session setup shared by the detector and classifier."""

from __future__ import annotations

from pathlib import Path

import onnxruntime as ort


class ModelLoadError(RuntimeError):
    pass


def load_session(path: Path, threads: int) -> ort.InferenceSession:
    if not path.is_file():
        raise ModelLoadError(f"Model file not found: {path} (run scripts/fetch_models.py)")
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
