"""Small per-user sliding-window rate limiter.

State lives in process memory, so on Cloud Run each instance limits on its own (best effort, which
is enough to stop one user from burning the shared Gemini / CalorieNinjas quotas).
"""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Annotated, Literal

from fastapi import Depends, Request

from app.core.errors import ApiError
from app.core.security import CurrentUser, User

Bucket = Literal["scan", "coach", "search"]


class SlidingWindowLimiter:
    def __init__(
        self, limit: int, window_s: float = 60.0, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.limit = limit
        self.window_s = window_s
        self._clock = clock
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window_s:
            hits.popleft()
        if len(hits) >= self.limit:
            retry_after = max(1, math.ceil(self.window_s - (now - hits[0])))
            raise ApiError(
                429,
                "rate_limited",
                "Too many requests",
                f"Please wait {retry_after}s and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)


def _limited(bucket: Bucket) -> Callable[..., object]:
    async def dependency(request: Request, user: CurrentUser) -> User:
        request.app.state.container.limiters[bucket].check(user.uid)
        return user

    return dependency


ScanUser = Annotated[User, Depends(_limited("scan"))]
CoachUser = Annotated[User, Depends(_limited("coach"))]
SearchUser = Annotated[User, Depends(_limited("search"))]
