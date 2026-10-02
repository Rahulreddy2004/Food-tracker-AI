"""Builds every long-lived service once at startup (models, HTTP client, repositories, LLM)."""

from __future__ import annotations

from dataclasses import dataclass, field

import anyio
import httpx
import structlog

from app.core.config import DATA_DIR, Settings
from app.core.ratelimit import Bucket, SlidingWindowLimiter
from app.ml.classifier import Classifier, FakeClassifier, OnnxClassifier, ZeroShotClassifier
from app.ml.detector import Detector, FakeDetector, NoDetector, OnnxYoloDetector
from app.ml.labels import FOOD101_CLASSES, LabelSet
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
    threads = settings.onnx_threads
    detector_path = settings.models_dir / settings.detector_file
    detector: Detector
    if detector_path.is_file():
        detector = OnnxYoloDetector(
            detector_path,
            confidence=settings.det_confidence,
            iou=settings.det_iou,
            max_boxes=settings.det_max_boxes,
            threads=threads,
        )
    elif settings.detector_required:
        raise ModelLoadError(f"Detector not found: {detector_path} (DETECTOR_REQUIRED is set)")
    else:
        log.warning("detector_missing", path=str(detector_path), effect="one dish per photo")
        detector = NoDetector()
    classifier: Classifier
    if settings.classifier == "siglip2":
        classifier = ZeroShotClassifier(
            settings.classifier_path,
            settings.models_dir / settings.dish_embeddings_file,
            labels,
            threads=threads,
        )
    else:
        classifier = OnnxClassifier(settings.classifier_path, FOOD101_CLASSES, threads=threads)
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
    nutrition = NutritionTable.load(DATA_DIR / "nutrition.json")
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
