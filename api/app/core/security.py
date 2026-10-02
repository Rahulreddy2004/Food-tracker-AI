"""Authentication: every protected route depends on `CurrentUser`.

The browser signs in with Firebase Auth and sends the Firebase ID token as `Authorization: Bearer`.
We verify it with the Firebase Admin SDK (signature, expiry, audience = our project).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import anyio
import structlog
from fastapi import Depends, Request
from firebase_admin import auth as fb_auth

from app.core.errors import ApiError
from app.core.firebase import get_firebase_app

log = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class User:
    uid: str
    email: str | None = None
    name: str | None = None


def _unauthenticated(detail: str) -> ApiError:
    return ApiError(
        401, "unauthenticated", "Sign in required", detail, headers={"WWW-Authenticate": "Bearer"}
    )


async def get_current_user(request: Request) -> User:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthenticated("Missing bearer token")

    def _verify() -> dict[str, Any]:
        return fb_auth.verify_id_token(token, app=get_firebase_app(), clock_skew_seconds=10)  # type: ignore[no-any-return]

    try:
        claims = await anyio.to_thread.run_sync(_verify)
    except (fb_auth.ExpiredIdTokenError, fb_auth.RevokedIdTokenError):
        raise _unauthenticated("Your session has expired") from None
    except (fb_auth.InvalidIdTokenError, ValueError) as exc:
        log.info("invalid_token", error=type(exc).__name__)
        raise _unauthenticated("Invalid token") from None

    user = User(uid=claims["uid"], email=claims.get("email"), name=claims.get("name"))
    structlog.contextvars.bind_contextvars(uid=user.uid)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
