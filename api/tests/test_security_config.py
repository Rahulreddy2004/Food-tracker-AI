from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from firebase_admin import auth as fb_auth
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import ApiError
from app.core.ratelimit import SlidingWindowLimiter
from app.core.security import get_current_user


@pytest.fixture
async def real_auth_client(app: FastAPI) -> Any:
    app.dependency_overrides.pop(get_current_user)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_protected_routes_need_a_token(real_auth_client: httpx.AsyncClient) -> None:
    for method, path in [("GET", "/v1/me/profile"), ("POST", "/v1/scan"), ("GET", "/v1/pantry")]:
        res = await real_auth_client.request(method, path)
        assert res.status_code == 401, path
        assert res.json()["code"] == "unauthenticated"
        assert res.headers["www-authenticate"] == "Bearer"
    assert (await real_auth_client.get("/v1/health/live")).status_code == 200


async def test_token_verification_outcomes(
    real_auth_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_verify(token: str, **_: Any) -> dict[str, Any]:
        if token == "good":
            return {"uid": "abc", "email": "a@b.c"}
        if token == "old":
            raise fb_auth.ExpiredIdTokenError("expired", cause=None)
        raise fb_auth.InvalidIdTokenError("bad")

    monkeypatch.setattr(fb_auth, "verify_id_token", fake_verify)
    monkeypatch.setattr("app.core.security.get_firebase_app", lambda: None)

    ok = await real_auth_client.get("/v1/me/profile", headers={"Authorization": "Bearer good"})
    assert ok.status_code == 200
    expired = await real_auth_client.get("/v1/me/profile", headers={"Authorization": "Bearer old"})
    assert expired.status_code == 401 and expired.json()["detail"] == "Your session has expired"
    bad = await real_auth_client.get("/v1/me/profile", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401 and bad.json()["detail"] == "Invalid token"
    wrong_scheme = await real_auth_client.get(
        "/v1/me/profile", headers={"Authorization": "Basic x"}
    )
    assert wrong_scheme.status_code == 401


async def test_cors_and_request_id(client: httpx.AsyncClient) -> None:
    preflight = await client.options(
        "/v1/scan",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"
    evil = await client.options(
        "/v1/scan",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in evil.headers
    res = await client.get("/v1/health/live", headers={"X-Request-ID": "trace-123"})
    assert res.headers["x-request-id"] == "trace-123"


def test_production_refuses_test_backends() -> None:
    with pytest.raises(ValidationError, match="not allowed in production"):
        Settings(_env_file=None, env="production", data_backend="memory")  # type: ignore[call-arg]
    prod = Settings(_env_file=None, env="production")  # type: ignore[call-arg]
    assert prod.model_backend == "onnx"


def test_cors_origins_parse_from_comma_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://a.app, https://b.app")
    assert Settings(_env_file=None).cors_origins == ["https://a.app", "https://b.app"]  # type: ignore[call-arg]


def test_sliding_window_limiter() -> None:
    now = [0.0]
    limiter = SlidingWindowLimiter(2, window_s=60, clock=lambda: now[0])
    limiter.check("u")
    limiter.check("u")
    with pytest.raises(ApiError) as err:
        limiter.check("u")
    assert err.value.code == "rate_limited" and err.value.headers == {"Retry-After": "60"}
    now[0] = 61
    limiter.check("u")
