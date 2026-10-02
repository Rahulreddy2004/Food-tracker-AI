"""Builds every long-lived service once at startup (models, HTTP client, repositories, LLM)."""

from __future__ import annotations

from dataclasses import dataclass, field

import anyio
import httpx
import structlog

from app.core.config import DATA_DIR, Settings
from app.core.ratelimit import Bucket, SlidingWindowLimiter
from app.ml.classifier import FakeClassifier, OnnxClassifier
from app.ml.detector import FakeDetector, OnnxYoloDetector
from app.ml.labels import LabelSet
from app.ml.pipeline import PipelineConfig, ScanPipeline
from app.ml.portion import PortionEstimator
from app.ml.runtime import ModelLoadError
from app.repositories.base import Repositories
from app.repositories.memory import MemoryRepositories
from app.services.account import AccountService
from app.services.barcode import OpenFoodFactsClient
from app.services.coach import CoachService
from app.services.llm import FakeProvider, GeminiProvider, LlmProvider
from app.services.nutrition import CalorieNinjasClient, FoodSearch, NutritionTable
from app.services.scan import ScanService

log = structlog.get_logger()


@dataclass
class Container:
    settings: Settings
    labels: LabelSet
    nutrition: NutritionTable
    scan: ScanService
    search: FoodSearch
    barcode: OpenFoodFactsClient
    repos: Repositories
    coach: CoachService | None
    account: AccountService
    http: httpx.AsyncClient
    limiters: dict[Bucket, SlidingWindowLimiter] = field(default_factory=dict)

    async def aclose(self) -> None:
        await self.http.aclose()


def build_pipeline(settings: Settings, labels: LabelSet) -> ScanPipeline:
    config = PipelineConfig(
        max_image_side=settings.max_image_side,
        min_box_area_frac=settings.min_box_area_frac,
        crop_pad_frac=settings.crop_pad_frac,
        dedupe_iou=settings.dedupe_iou,
        top_k=settings.top_k,
    )
    if settings.model_backend == "fake":
        return ScanPipeline(FakeDetector(), FakeClassifier(labels), config)
    detector = OnnxYoloDetector(
        settings.models_dir / settings.detector_file,
        confidence=settings.det_confidence,
        iou=settings.det_iou,
        max_boxes=settings.det_max_boxes,
        threads=settings.onnx_threads,
    )
    classifier = OnnxClassifier(
        settings.models_dir / settings.classifier_file, len(labels), threads=settings.onnx_threads
    )
    return ScanPipeline(detector, classifier, config)


def build_llm(settings: Settings) -> LlmProvider | None:
    if settings.llm_backend == "fake":
        return FakeProvider()
    if settings.gemini_api_key is None:
        log.warning("gemini_key_missing", hint="Set GEMINI_API_KEY to enable the coach")
        return None
    return GeminiProvider(
        settings.gemini_api_key.get_secret_value(),
        settings.gemini_model,
        settings.http_timeout_s * 4,
    )


def build_repositories(settings: Settings) -> Repositories:
    if settings.data_backend == "memory":
        return MemoryRepositories()
    from app.repositories.firestore import FirestoreRepositories

    return FirestoreRepositories()


async def build_container(settings: Settings, repos: Repositories | None = None) -> Container:
    labels = LabelSet.load(DATA_DIR / "labels.json")
    nutrition = NutritionTable.load(DATA_DIR / "nutrition_food101.json")
    portions = PortionEstimator.load(DATA_DIR / "portions.json")

    pipeline: ScanPipeline | None = None
    reason: str | None = None
    try:
        pipeline = await anyio.to_thread.run_sync(build_pipeline, settings, labels)
        log.info(
            "models_loaded", detector=pipeline.detector.name, classifier=pipeline.classifier.name
        )
    except ModelLoadError as exc:
        reason = str(exc)
        log.error("models_unavailable", reason=reason)

    http = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.http_timeout_s),
        transport=httpx.AsyncHTTPTransport(retries=2),
        follow_redirects=True,
    )
    calorie_key = settings.calorieninjas_api_key
    calorie = CalorieNinjasClient(http, calorie_key.get_secret_value() if calorie_key else None)
    repos = repos or build_repositories(settings)
    llm = build_llm(settings)

    return Container(
        settings=settings,
        labels=labels,
        nutrition=nutrition,
        scan=ScanService(
            pipeline,
            labels,
            nutrition,
            portions,
            confirm_below=settings.confirm_below,
            unavailable_reason=reason,
        ),
        search=FoodSearch(labels, nutrition, calorie),
        barcode=OpenFoodFactsClient(http, settings.off_user_agent),
        repos=repos,
        coach=CoachService(repos, llm) if llm else None,
        account=AccountService(
            repos, settings.storage_bucket, use_firebase=settings.data_backend == "firestore"
        ),
        http=http,
        limiters={
            "scan": SlidingWindowLimiter(settings.rate_scan_per_min),
            "coach": SlidingWindowLimiter(settings.rate_coach_per_min),
            "search": SlidingWindowLimiter(settings.rate_search_per_min),
        },
    )
