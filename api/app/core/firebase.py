"""Firebase Admin initialisation.

On Cloud Run the runtime service account is used automatically (Application Default Credentials),
so no key file is needed. Locally, either point GOOGLE_APPLICATION_CREDENTIALS at a key file or run
against the Firebase emulators (FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import firebase_admin

from app.core.config import get_settings


@lru_cache
def get_firebase_app() -> firebase_admin.App:
    settings = get_settings()
    options: dict[str, Any] = {}
    if settings.firebase_project_id:
        options["projectId"] = settings.firebase_project_id
    if settings.storage_bucket:
        options["storageBucket"] = settings.storage_bucket

    using_emulator = bool(
        os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") or os.environ.get("FIRESTORE_EMULATOR_HOST")
    )
    if using_emulator and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        # The emulators accept any credentials; avoid looking up real ADC on dev machines.
        from firebase_admin import credentials
        from google.auth.credentials import AnonymousCredentials

        class _EmulatorCredential(credentials.Base):  # type: ignore[misc]
            def get_credential(self) -> AnonymousCredentials:
                return AnonymousCredentials()  # type: ignore[no-untyped-call]

        return firebase_admin.initialize_app(_EmulatorCredential(), options)
    return firebase_admin.initialize_app(options=options)
