"""Coach endpoints. Chat replies stream as Server-Sent Events:

event: delta   data: {"text": "..."}      (many)
event: done    data: {}
event: error   data: {"code": "...", "title": "..."}   (only if it fails mid-stream)
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import structlog
from fastapi import APIRouter, Response
from fastapi.responses import StreamingResponse

from app.core.errors import ApiError, not_found
from app.core.ratelimit import CoachUser
from app.core.security import CurrentUser
from app.routers.deps import Deps
from app.schemas.coach import CoachMessageIn, CoachThread, MealInsight, MealInsightIn
from app.services.coach import CoachService

log = structlog.get_logger()
router = APIRouter(prefix="/coach", tags=["coach"])


def _coach(deps: Deps) -> CoachService:
    if deps.coach is None:
        raise ApiError(503, "coach_unavailable", "The AI coach isn't configured on this server")
    return deps.coach


def _sse(event: str, payload: dict[str, object]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


@router.get("/thread", response_model=CoachThread, summary="Your conversation with the coach")
async def get_thread(deps: Deps, user: CurrentUser) -> CoachThread:
    return CoachThread(messages=await _coach(deps).thread(user.uid))


@router.delete("/thread", status_code=204, response_class=Response, summary="Start over")
async def clear_thread(deps: Deps, user: CurrentUser) -> Response:
    await _coach(deps).clear(user.uid)
    return Response(status_code=204)


@router.post(
    "/messages",
    summary="Send a message; the reply streams back as Server-Sent Events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def send_message(deps: Deps, user: CoachUser, body: CoachMessageIn) -> StreamingResponse:
    coach = _coach(deps)
    chunks = coach.reply(user.uid, body.message.strip())
    # Wait for the first chunk so an immediate failure becomes a normal HTTP error.
    first = await anext(chunks, "")

    async def events() -> AsyncIterator[bytes]:
        try:
            if first:
                yield _sse("delta", {"text": first})
            async for chunk in chunks:
                yield _sse("delta", {"text": chunk})
            yield _sse("done", {})
        except ApiError as exc:
            yield _sse("error", {"code": exc.code, "title": exc.title})
        except Exception:
            log.exception("coach_stream_failed")
            yield _sse("error", {"code": "internal_error", "title": "The reply was interrupted"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/meal-insight", response_model=MealInsight, summary="A short tip about a logged meal")
async def meal_insight(deps: Deps, user: CoachUser, body: MealInsightIn) -> MealInsight:
    coach = _coach(deps)
    meal = await deps.repos.meals.get(user.uid, body.meal_id)
    if meal is None:
        raise not_found("Meal")
    return await coach.meal_insight(user.uid, meal)
