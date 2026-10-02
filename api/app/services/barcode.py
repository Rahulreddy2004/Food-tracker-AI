"""Packaged-food lookup via Open Food Facts (free, open database)."""

from __future__ import annotations

import re
from typing import Any

import httpx
import structlog
from cachetools import TTLCache

from app.core.errors import ApiError
from app.schemas.common import Macros
from app.schemas.foods import Product

log = structlog.get_logger()

BARCODE_RE = re.compile(r"^\d{8,14}$")
KJ_PER_KCAL = 4.184
_FIELDS = ",".join(
    [
        "code",
        "product_name",
        "generic_name",
        "brands",
        "image_front_small_url",
        "serving_size",
        "serving_quantity",
        "nutriments",
        "nutriscore_grade",
        "nova_group",
        "categories",
    ]
)


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _macros(nutriments: dict[str, Any], suffix: str) -> Macros | None:
    kcal = _num(nutriments.get(f"energy-kcal_{suffix}"))
    if kcal is None:
        kj = _num(nutriments.get(f"energy_{suffix}"))
        kcal = kj / KJ_PER_KCAL if kj is not None else None
    if kcal is None:
        return None
    return Macros(
        kcal=round(kcal, 1),
        protein_g=round(_num(nutriments.get(f"proteins_{suffix}")) or 0, 1),
        fat_g=round(_num(nutriments.get(f"fat_{suffix}")) or 0, 1),
        carbs_g=round(_num(nutriments.get(f"carbohydrates_{suffix}")) or 0, 1),
    )


def parse_product(code: str, product: dict[str, Any]) -> Product | None:
    nutriments = product.get("nutriments") or {}
    per100g = _macros(nutriments, "100g")
    if per100g is None:
        return None
    serving_g = _num(product.get("serving_quantity"))
    per_serving = _macros(nutriments, "serving")
    if per_serving is None and serving_g:
        per_serving = per100g.for_grams(serving_g)
    categories = [c.strip() for c in str(product.get("categories") or "").split(",") if c.strip()]
    grade = str(product.get("nutriscore_grade") or "").lower()
    nova = product.get("nova_group")
    name = (product.get("product_name") or product.get("generic_name") or "").strip()
    return Product(
        code=code,
        name=name or "Unnamed product",
        brand=(str(product.get("brands") or "").split(",")[0].strip() or None),
        image_url=product.get("image_front_small_url") or None,
        group=categories[0] if categories else "Packaged food",
        serving_g=serving_g if serving_g and serving_g > 0 else None,
        serving_label=(str(product.get("serving_size")).strip() or None)
        if product.get("serving_size")
        else None,
        per100g=per100g,
        per_serving=per_serving,
        nutri_score=grade if grade in {"a", "b", "c", "d", "e"} else None,
        nova_group=int(nova) if isinstance(nova, int | float) and 1 <= nova <= 4 else None,
    )


class OpenFoodFactsClient:
    URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"

    def __init__(self, http: httpx.AsyncClient, user_agent: str) -> None:
        self.http = http
        self.user_agent = user_agent
        self._cache: TTLCache[str, Product | None] = TTLCache(maxsize=4096, ttl=24 * 3600)

    async def lookup(self, code: str) -> Product:
        if not BARCODE_RE.match(code):
            raise ApiError(
                422, "invalid_barcode", "That doesn't look like a barcode", "Use 8–14 digits."
            )
        if code in self._cache:
            cached = self._cache[code]
            if cached is None:
                raise _not_found()
            return cached
        try:
            response = await self.http.get(
                self.URL.format(code=code),
                params={"fields": _FIELDS},
                headers={"User-Agent": self.user_agent},
            )
            if response.status_code == 404:
                self._cache[code] = None
                raise _not_found()
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            log.warning("off_failed", error=type(exc).__name__)
            raise ApiError(
                502,
                "upstream_unavailable",
                "The product database is not responding",
                "Try again soon.",
            ) from None

        product = (
            payload.get("product")
            if payload.get("status") in (1, "success_with_warnings", "success")
            else None
        )
        parsed = parse_product(code, product) if product else None
        self._cache[code] = parsed
        if parsed is None:
            raise _not_found()
        return parsed


def _not_found() -> ApiError:
    return ApiError(
        404,
        "product_not_found",
        "We couldn't find that product",
        "Try typing the barcode again, or add it to your pantry by hand.",
    )
