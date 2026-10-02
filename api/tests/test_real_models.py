"""Scan with the real ONNX models (run with `pytest -m models`; MODELS_DIR may point elsewhere)."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from app.container import build_container
from app.core.config import API_DIR, Settings
from app.core.security import get_current_user
from app.main import create_app
from tests.conftest import FIXTURES, _test_user

MODELS_DIR = Path(os.environ.get("MODELS_DIR", API_DIR / "models"))
HAVE_MODELS = (MODELS_DIR / "best.onnx").is_file() and (MODELS_DIR / "classifier.onnx").is_file()

pytestmark = [
    pytest.mark.models,
    pytest.mark.skipif(not HAVE_MODELS, reason=f"ONNX models not found in {MODELS_DIR}"),
]


@pytest.fixture
async def onnx_client() -> AsyncIterator[httpx.AsyncClient]:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        env="test",
        model_backend="onnx",
        models_dir=MODELS_DIR,
        data_backend="memory",
        llm_backend="fake",
    )
    container = await build_container(settings)
    assert container.scan.ready, container.scan.unavailable_reason
    app = create_app(settings, container)
    app.state.container = container
    app.dependency_overrides[get_current_user] = _test_user
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c
    await container.aclose()


async def test_scan_with_real_models(onnx_client: httpx.AsyncClient) -> None:
    photo = (FIXTURES / "palak_paneer.jpg").read_bytes()
    res = await onnx_client.post("/v1/scan", files={"image": ("meal.jpg", photo, "image/jpeg")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["models"]["detector"].startswith("yolov8-onnx")
    assert body["models"]["classifier"].startswith("efficientnetv2b3-onnx")
    assert body["items"], "at least one item (detected or whole-image fallback)"
    for item in body["items"]:
        assert len(item["predictions"]) == 3
        confs = [p["confidence"] for p in item["predictions"]]
        assert confs == sorted(confs, reverse=True)
        assert all(0 <= c <= 1 for c in confs)
        assert item["predictions"][0]["suggestedGrams"] > 0
    print(
        "\nreal-model scan:",
        body["source"],
        [
            (i["predictions"][0]["display"], round(i["predictions"][0]["confidence"], 3))
            for i in body["items"]
        ],
        f"{body['timings']['totalMs']} ms",
    )
