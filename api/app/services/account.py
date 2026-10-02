"""Account export and deletion (Firestore data, Storage photos and the Firebase Auth user)."""

from __future__ import annotations

import contextlib
from typing import Any

import anyio
import structlog
from firebase_admin import auth as fb_auth
from firebase_admin import storage

from app.core.firebase import get_firebase_app
from app.repositories.base import Repositories

log = structlog.get_logger()


class AccountService:
    def __init__(self, repos: Repositories, storage_bucket: str | None, use_firebase: bool) -> None:
        self.repos = repos
        self.storage_bucket = storage_bucket
        self.use_firebase = use_firebase

    async def export(self, uid: str) -> dict[str, Any]:
        data = await self.repos.account.export(uid)
        return {"format": "food-tracker-export", "version": 2, "uid": uid, **data}

    async def delete(self, uid: str) -> None:
        await self.repos.account.delete_all(uid)
        if not self.use_firebase:
            return
        if self.storage_bucket:
            await anyio.to_thread.run_sync(self._delete_photos, uid)
        await anyio.to_thread.run_sync(self._delete_auth_user, uid)

    def _delete_photos(self, uid: str) -> None:
        try:
            bucket = storage.bucket(self.storage_bucket, app=get_firebase_app())
            blobs = list(bucket.list_blobs(prefix=f"users/{uid}/"))
            for blob in blobs:
                blob.delete()
            log.info("deleted_photos", count=len(blobs))
        except Exception:  # deletion must continue even if Storage is not set up
            log.exception("delete_photos_failed")

    @staticmethod
    def _delete_auth_user(uid: str) -> None:
        with contextlib.suppress(fb_auth.UserNotFoundError):
            fb_auth.delete_user(uid, app=get_firebase_app())
