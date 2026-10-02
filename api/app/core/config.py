"""Application settings, validated from environment variables (and `api/.env` in development)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = API_DIR / "app" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = False

    # Comma-separated in the environment: "http://localhost:5173,https://app.example.com"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # --- Models ---------------------------------------------------------------
    model_backend: Literal["onnx", "fake"] = "onnx"
    models_dir: Path = API_DIR / "models"
    # siglip2: open-vocabulary SigLIP 2, names every dish in labels.json (default)
    # efficientnet: the EfficientNetV2-B3 Food-101 model, the 101 Food-101 dishes only
    classifier: Literal["siglip2", "efficientnet"] = "siglip2"
    classifier_file: str | None = None  # default: siglip2_vision.onnx or classifier.onnx
    dish_embeddings_file: str = "siglip2_dishes.npz"
    detector_file: str = "best.onnx"
    # Without a detector each photo is classified as one dish; set true to refuse to start instead.
    detector_required: bool = False
    onnx_threads: int = Field(default=2, ge=1, le=16)
    max_image_side: int = Field(default=1280, ge=320, le=4096)
    max_upload_mb: float = Field(default=8, gt=0, le=25)
    det_confidence: float = Field(default=0.25, ge=0, le=1)
    det_iou: float = Field(default=0.45, ge=0, le=1)
    det_max_boxes: int = Field(default=10, ge=1, le=50)
    min_box_area_frac: float = Field(default=0.01, ge=0, le=1)
    dedupe_iou: float = Field(default=0.6, ge=0, le=1)
    crop_pad_frac: float = Field(default=0.0, ge=0, le=0.5)
    # Ask the user to confirm guesses below this confidence. For SigLIP 2 over 200 dishes, 0.5
    # flags ~1 in 10 scans (mostly wrong guesses); the rest are 90-95% right (see MODEL_CARD.md).
    confirm_below: float = Field(default=0.50, ge=0, le=1)
    top_k: int = Field(default=3, ge=1, le=10)

    # --- Data -----------------------------------------------------------------
    data_backend: Literal["firestore", "memory"] = "firestore"
    firebase_project_id: str | None = None
    storage_bucket: str | None = None

    # --- External services ------------------------------------------------------
    llm_backend: Literal["gemini", "fake"] = "gemini"
    gemini_api_key: SecretStr | None = None
    # Stable model ids change over time: https://ai.google.dev/gemini-api/docs/models
    gemini_model: str = "gemini-3.6-flash"
    calorieninjas_api_key: SecretStr | None = None
    http_timeout_s: float = Field(default=8.0, gt=0, le=60)
    off_user_agent: str = "FoodTrackerAI/2.0 (+https://github.com/Rahulreddy2004/Food-tracker-AI)"

    # --- Rate limits (requests per minute, per user) ----------------------------
    rate_scan_per_min: int = Field(default=30, ge=1)
    rate_coach_per_min: int = Field(default=20, ge=1)
    rate_search_per_min: int = Field(default=120, ge=1)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _guard_production(self) -> Settings:
        if self.env == "production":
            test_only = {
                "DATA_BACKEND=memory": self.data_backend == "memory",
                "MODEL_BACKEND=fake": self.model_backend == "fake",
                "LLM_BACKEND=fake": self.llm_backend == "fake",
            }
            bad = [name for name, used in test_only.items() if used]
            if bad:
                raise ValueError(f"Test-only backends are not allowed in production: {bad}")
        return self

    @property
    def classifier_path(self) -> Path:
        default = "siglip2_vision.onnx" if self.classifier == "siglip2" else "classifier.onnx"
        return self.models_dir / (self.classifier_file or default)

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()
