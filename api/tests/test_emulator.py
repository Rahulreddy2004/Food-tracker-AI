"""Integration tests against the Firebase emulators (Auth + Firestore).

Run:  firebase emulators:exec --project demo-foodtracker --only auth,firestore \
        "cd api && FIREBASE_PROJECT_ID=demo-foodtracker uv run pytest -m emulator"
"""

from __future__ import annotations

import datetime as dt
import os
import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio

from app.container import build_container
from app.core.config import Settings
from app.main import create_app
from app.repositories.firestore import FirestoreRepositories
from app.schemas.coach import ChatMessage
from app.schemas.common import Macros
from app.schemas.meals import MealIn, MealItemIn
from app.schemas.pantry import PantryIn
from app.schemas.profile import default_profile
from app.services import diary

pytestmark = [
    pytest.mark.emulator,
    # firebase-admin caches one async Firestore client per app, bound to the first event loop.
    pytest.mark.asyncio(loop_scope="session"),
    pytest.mark.skipif(
        not (os.environ.get("FIRESTORE_EMULATOR_HOST") and os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")),
        reason="Firebase emulators are not running",
    ),
]

PER100 = Macros(kcal=200, protein_g=10, fat_g=5, carbs_g=25)


def _meal(day: str) -> MealIn:
    return MealIn(
        local_date=dt.date.fromisoformat(day),
        meal_type="lunch",
        source="manual",
        items=[MealItemIn(name="rice", display="Rice", grams=150, per100g=PER100)],
    )


async def test_firestore_repositories_roundtrip() -> None:
    repos = FirestoreRepositories()
    uid = f"it-{uuid.uuid4().hex[:8]}"

    assert await repos.profiles.get(uid) is None
    profile = default_profile()
    profile.timezone = "Asia/Kolkata"
    await repos.profiles.put(uid, profile)
    assert (await repos.profiles.get(uid)).timezone == "Asia/Kolkata"  # type: ignore[union-attr]

    meals = [diary.new_meal(uid, _meal(d)) for d in ("2026-09-29", "2026-10-01", "2026-10-02")]
    for meal in meals:
        await repos.meals.put(uid, meal)
    in_range = await repos.meals.list_range(uid, dt.date(2026, 10, 1), dt.date(2026, 10, 2))
    assert [m.local_date.isoformat() for m in in_range] == ["2026-10-01", "2026-10-02"]
    fetched = await repos.meals.get(uid, meals[0].id)
    assert fetched is not None and fetched.totals.kcal == 300
    assert fetched.items[0].nutrition.kcal == 300
    assert await repos.meals.delete(uid, meals[0].id) is True
    assert await repos.meals.delete(uid, meals[0].id) is False

    food = diary.new_pantry_food(
        PantryIn(name="Idli", serving_g=40, per_serving=Macros(kcal=58, protein_g=2, fat_g=0.4, carbs_g=12))
    )
    await repos.pantry.put(uid, food)
    assert [f.name for f in await repos.pantry.list(uid)] == ["Idli"]

    now = dt.datetime.now(dt.UTC)
    for i, role in enumerate(["user", "model", "user"]):
        at = now + dt.timedelta(seconds=i)
        await repos.coach.append(uid, ChatMessage(id=f"{i:03d}", role=role, text=f"m{i}", created_at=at))  # type: ignore[arg-type]
    assert [m.text for m in await repos.coach.recent(uid, 2)] == ["m1", "m2"]

    exported = await repos.account.export(uid)
    assert exported["profile"]["timezone"] == "Asia/Kolkata"
    assert len(exported["meals"]) == 2 and len(exported["pantry"]) == 1
    assert len(exported["coachMessages"]) == 3

    await repos.account.delete_all(uid)
    assert await repos.profiles.get(uid) is None
    assert await repos.meals.list_range(uid, dt.date(2026, 1, 1), dt.date(2026, 12, 31)) == []
    assert await repos.coach.recent(uid, 10) == []


@pytest_asyncio.fixture(loop_scope="session")
async def real_client() -> AsyncIterator[httpx.AsyncClient]:
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        env="test",
        model_backend="fake",
        data_backend="firestore",
        llm_backend="fake",
        firebase_project_id=os.environ.get("FIREBASE_PROJECT_ID", "demo-foodtracker"),
    )
    container = await build_container(settings)
    app = create_app(settings, container)
    app.state.container = container
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await container.aclose()


async def _sign_up() -> str:
    host = os.environ["FIREBASE_AUTH_EMULATOR_HOST"]
    url = f"http://{host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key"
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    async with httpx.AsyncClient() as http:
        res = await http.post(url, json={"email": email, "password": "secret123", "returnSecureToken": True})
    res.raise_for_status()
    return str(res.json()["idToken"])


async def test_real_firebase_token_end_to_end(real_client: httpx.AsyncClient) -> None:
    token = await _sign_up()
    auth = {"Authorization": f"Bearer {token}"}

    assert (await real_client.get("/v1/me/profile")).status_code == 401
    profile = await real_client.get("/v1/me/profile", headers=auth)
    assert profile.status_code == 200, profile.text

    body = _meal("2026-10-02").model_dump(mode="json", by_alias=True)
    created = await real_client.post("/v1/meals", json=body, headers=auth)
    assert created.status_code == 201, created.text
    listed = await real_client.get(
        "/v1/meals", params={"from": "2026-10-02", "to": "2026-10-02"}, headers=auth
    )
    assert len(listed.json()["meals"]) == 1

    assert (await real_client.delete("/v1/me", headers=auth)).status_code == 204
    # The Auth user is gone too, so the old token's user has no data left.
    after = await real_client.get(
        "/v1/meals", params={"from": "2026-10-02", "to": "2026-10-02"}, headers=auth
    )
    assert after.status_code in (200, 401)
    if after.status_code == 200:
        assert after.json()["meals"] == []
