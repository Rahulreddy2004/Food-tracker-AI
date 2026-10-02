from __future__ import annotations

import io
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI, Request
from PIL import Image

from app.container import Container, build_container
from app.core.config import Settings
from app.core.security import User, get_current_user
from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        env="test",
        model_backend="fake",
        data_backend="memory",
        llm_backend="fake",
        cors_origins="http://localhost:5173",  # type: ignore[arg-type]
    )


@pytest.fixture
async def container(settings: Settings) -> AsyncIterator[Container]:
    built = await build_container(settings)
    yield built
    await built.aclose()


async def _test_user(request: Request) -> User:
    """Tests pick the user with a header instead of a real Firebase token."""
    uid = request.headers.get("x-test-uid", "user-1")
    return User(uid=uid, email=f"{uid}@example.com", name="Test User")


@pytest.fixture
def app(settings: Settings, container: Container) -> FastAPI:
    application = create_app(settings, container)
    application.state.container = container
    application.dependency_overrides[get_current_user] = _test_user
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def food_jpeg() -> bytes:
    return (FIXTURES / "palak_paneer.jpg").read_bytes()


def make_jpeg(width: int, height: int, color: tuple[int, int, int] = (200, 120, 60)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG", quality=85)
    return buf.getvalue()
