"""Safe image decoding: format allow-list, EXIF rotation, RGB, size cap, decompression guard."""

from __future__ import annotations

import io
import warnings

import numpy as np
import pillow_heif
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.problem import ApiError
from app.ml.structs import Box, RGBImage

pillow_heif.register_heif_opener()

ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "HEIF", "AVIF", "BMP"}
MAX_PIXELS = 60_000_000  # ~60 MP; anything bigger is rejected before decoding
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def decode_image(data: bytes, max_side: int) -> RGBImage:
    """Decode upload bytes into an upright RGB array whose longest side is at most `max_side`."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            if image.format not in ALLOWED_FORMATS:
                raise ApiError(
                    415,
                    "unsupported_image",
                    "Unsupported image type",
                    "Use a JPEG, PNG, WebP or HEIC photo.",
                )
            rgb = ImageOps.exif_transpose(image).convert("RGB")
    except ApiError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError(
            415, "unsupported_image", "That file isn't a readable image", "Try another photo."
        ) from None
    except (OSError, ValueError, SyntaxError):
        raise ApiError(
            415, "unsupported_image", "The image looks damaged", "Try another photo."
        ) from None

    if max(rgb.size) > max_side:
        rgb.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return np.asarray(rgb, dtype=np.uint8)


def crop(image: RGBImage, box: Box) -> RGBImage:
    h, w = image.shape[:2]
    b = box.clip(w, h)
    x1, y1 = int(np.floor(b.x1)), int(np.floor(b.y1))
    x2, y2 = int(np.ceil(b.x2)), int(np.ceil(b.y2))
    return image[y1:y2, x1:x2]


RESAMPLING = {
    "bilinear": Image.Resampling.BILINEAR,  # tf.image.resize's default
    "bicubic": Image.Resampling.BICUBIC,
}


def resize(image: RGBImage, size: tuple[int, int], resample: str = "bilinear") -> RGBImage:
    """Resize to (width, height). Bilinear matches tf.image.resize and the SigLIP processors."""
    pil = Image.fromarray(image)
    return np.asarray(pil.resize(size, RESAMPLING[resample]), dtype=np.uint8)
