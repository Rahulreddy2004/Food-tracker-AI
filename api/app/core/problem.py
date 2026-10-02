"""The typed error the app raises. Dependency-free, so `app.ml` can use it without the web stack
(the ml/ conversion and evaluation scripts import `app.ml` without installing FastAPI)."""

from __future__ import annotations


class ApiError(Exception):
    """Raise anywhere in the app to return a typed error to the client."""

    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail or title)
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.headers = headers


def not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} not found")
