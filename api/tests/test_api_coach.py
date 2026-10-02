from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.container import Container
from app.core.errors import ApiError
from app.services.llm import FakeProvider, Turn
from tests.test_api_diary import meal_body


def parse_sse(raw: str) -> list[tuple[str, dict[str, object]]]:
    events = []
    for block in raw.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def test_chat_streams_and_saves_thread(
    client: httpx.AsyncClient, container: Container
) -> None:
    await client.post("/v1/meals", json=meal_body(localDate="2026-10-02"))
    res = await client.post("/v1/coach/messages", json={"message": "What should I eat tonight?"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)
    assert events[-1] == ("done", {})
    text = "".join(str(e[1]["text"]) for e in events if e[0] == "delta")
    assert "What should I eat tonight?" in text

    thread = (await client.get("/v1/coach/thread")).json()["messages"]
    assert [m["role"] for m in thread] == ["user", "model"]
    assert thread[1]["text"] == text.strip()

    # The system prompt carries the user's own data and the safety rules.
    llm = container.coach.llm  # type: ignore[union-attr]
    assert isinstance(llm, FakeProvider) and llm.last_system
    assert "<CONTEXT>" in llm.last_system and "not a doctor" in llm.last_system

    await client.post("/v1/coach/messages", json={"message": "And tomorrow?"})
    assert [t.role for t in llm.last_history] == ["user", "model"], "previous turns are sent"

    assert (await client.delete("/v1/coach/thread")).status_code == 204
    assert (await client.get("/v1/coach/thread")).json()["messages"] == []


async def test_chat_failure_before_first_chunk_is_http_error(
    client: httpx.AsyncClient, container: Container
) -> None:
    class Broken(FakeProvider):
        async def stream_chat(
            self, system: str, history: list[Turn], message: str
        ) -> AsyncIterator[str]:
            raise ApiError(503, "coach_unavailable", "The AI coach is unavailable right now")
            yield ""  # pragma: no cover

    assert container.coach is not None
    container.coach.llm = Broken()
    res = await client.post("/v1/coach/messages", json={"message": "hi"})
    assert res.status_code == 503 and res.json()["code"] == "coach_unavailable"
    assert (await client.get("/v1/coach/thread")).json()["messages"] == [], "nothing saved"


async def test_chat_validation_and_unconfigured(
    client: httpx.AsyncClient, container: Container
) -> None:
    assert (await client.post("/v1/coach/messages", json={"message": ""})).status_code == 422
    assert (
        await client.post("/v1/coach/messages", json={"message": "x" * 2001})
    ).status_code == 422
    container.coach = None
    res = await client.post("/v1/coach/messages", json={"message": "hi"})
    assert res.status_code == 503 and res.json()["code"] == "coach_unavailable"


async def test_meal_insight(client: httpx.AsyncClient) -> None:
    meal = (await client.post("/v1/meals", json=meal_body())).json()
    res = await client.post("/v1/coach/meal-insight", json={"mealId": meal["id"]})
    assert res.status_code == 200
    assert set(res.json()) == {"headline", "tip", "nextMealSuggestion"}
    missing = await client.post("/v1/coach/meal-insight", json={"mealId": "nope"})
    assert missing.status_code == 404
