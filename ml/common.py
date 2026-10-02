"""Shared helpers for the ml/ scripts. Pre/post-processing comes from the API package itself, so
parity and evaluation exercise exactly the code that serves users."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "api"
MODELS = API / "models"
sys.path.insert(0, str(API))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_keras(path: Path):  # type: ignore[no-untyped-def]
    """Load the .h5 classifier with Keras 3, falling back to legacy tf.keras (Keras 2) files."""
    import tensorflow as tf

    try:
        return tf.keras.models.load_model(path, compile=False)
    except Exception as keras3_error:
        try:
            import tf_keras  # type: ignore[import-not-found]
        except ImportError:
            raise keras3_error from None
        return tf_keras.models.load_model(path, compile=False)
