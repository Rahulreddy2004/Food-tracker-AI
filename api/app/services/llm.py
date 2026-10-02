"""LLM providers behind one interface: Gemini (production) and a deterministic fake (tests)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

import structlog
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.core.errors import ApiError

log = structlog.get_logger()

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True, slots=True)
class Turn:
    role: Literal["user", "model"]
    text: str


class LlmProvider(Protocol):
    name: str

    def stream_chat(self, system: str, history: list[Turn], message: str) -> AsyncIterator[str]: ...

    async def generate_json(self, system: str, prompt: str, schema: type[T]) -> T: ...


def _unavailable() -> ApiError:
    return ApiError(
        503,
        "coach_unavailable",
        "The AI coach is unavailable right now",
        "Please try again shortly.",
    )


class GeminiProvider:
    def __init__(self, api_key: str, model: str, timeout_s: float) -> None:
        self.client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_s * 1000))
        )
        self.model = model
        self.name = f"gemini:{model}"

    @staticmethod
    def _contents(history: list[Turn], message: str) -> types.ContentListUnion:
        turns = [*history, Turn("user", message)]
        contents: list[types.ContentUnion] = [
            types.Content(role=turn.role, parts=[types.Part.from_text(text=turn.text)])
            for turn in turns
        ]
        return contents

    async def stream_chat(
        self, system: str, history: list[Turn], message: str
    ) -> AsyncIterator[str]:
        config = types.GenerateContentConfig(
            system_instruction=system, temperature=0.7, max_output_tokens=2048
        )
        try:
            stream = await self.client.aio.models.generate_content_stream(
                model=self.model, contents=self._contents(history, message), config=config
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except genai_errors.APIError as exc:
            log.warning("gemini_stream_failed", status=exc.code, message=exc.message)
            raise _unavailable() from None

    async def generate_json(self, system: str, prompt: str, schema: type[T]) -> T:
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.6,
            max_output_tokens=1024,
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model, contents=prompt, config=config
            )
            return schema.model_validate_json(response.text or "")
        except genai_errors.APIError as exc:
            log.warning("gemini_json_failed", status=exc.code, message=exc.message)
            raise _unavailable() from None
        except ValidationError:
            log.warning("gemini_json_invalid")
            raise _unavailable() from None


class FakeProvider:
    """Deterministic, streaming-shaped replies for tests and offline demos."""

    name = "fake-llm"

    def __init__(self, delay_s: float = 0.0) -> None:
        self.delay_s = delay_s
        self.last_system: str | None = None
        self.last_history: list[Turn] = []

    async def stream_chat(
        self, system: str, history: list[Turn], message: str
    ) -> AsyncIterator[str]:
        self.last_system, self.last_history = system, history
        reply = (
            f"Here's a thought on “{message[:60]}”: build your next meal around a palm-sized "
            "portion of protein, half a plate of vegetables, and a fist of whole grains."
        )
        for word in reply.split(" "):
            if self.delay_s:
                await asyncio.sleep(self.delay_s)
            yield word + " "

    async def generate_json(self, system: str, prompt: str, schema: type[T]) -> T:
        self.last_system = system
        sample = {
            "headline": "Nice balance on that meal",
            "tip": "You're on track for protein today — keep dinner lighter on fried foods.",
            "next_meal_suggestion": "Grilled fish or dal with a big salad and some brown rice.",
        }
        return schema.model_validate(sample)
