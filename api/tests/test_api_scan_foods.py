from __future__ import annotations

import httpx
import pytest
import respx

from app.container import Container
from app.services.barcode import OpenFoodFactsClient
from app.services.nutrition import CalorieNinjasClient
from tests.conftest import make_jpeg


async def test_health(client: httpx.AsyncClient) -> None:
    assert (await client.get("/v1/health/live")).json()["status"] == "ok"
    ready = await client.get("/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "models": True, "coach": True, "detail": None}


async def test_scan_returns_items_with_nutrition(
    client: httpx.AsyncClient, food_jpeg: bytes
) -> None:
    res = await client.post("/v1/scan", files={"image": ("meal.jpg", food_jpeg, "image/jpeg")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["source"] == "detector"
    assert body["width"] == 640 and body["height"] == 640
    assert len(body["items"]) == 3
    first = body["items"][0]
    assert set(first) == {"id", "box", "detectorScore", "needsConfirmation", "predictions"}
    assert 0 <= first["box"]["x"] <= 1 and 0 < first["box"]["w"] <= 1
    top = first["predictions"][0]
    assert top["label"] == "pizza" and top["display"] == "Pizza"
    assert top["per100g"]["kcal"] > 0
    assert top["suggestedGrams"] > 0 and top["portionMethod"] == "box_area"
    # The third fake item is a 34% guess → it must ask the user to confirm.
    assert [i["needsConfirmation"] for i in body["items"]].count(True) == 1
    assert body["models"] == {"detector": "fake-detector", "classifier": "fake-classifier"}


async def test_scan_rejects_bad_uploads(client: httpx.AsyncClient, container: Container) -> None:
    not_image = await client.post("/v1/scan", files={"image": ("x.jpg", b"hello", "image/jpeg")})
    assert not_image.status_code == 415
    assert not_image.headers["content-type"].startswith("application/problem+json")
    assert not_image.json()["code"] == "unsupported_image"

    container.settings.max_upload_mb = 0.01
    too_big = await client.post(
        "/v1/scan", files={"image": ("big.jpg", make_jpeg(800, 800), "image/jpeg")}
    )
    assert too_big.status_code == 413
    assert too_big.json()["code"] == "image_too_large"

    missing = await client.post("/v1/scan")
    assert missing.status_code == 422


async def test_scan_is_rate_limited_per_user(
    client: httpx.AsyncClient, container: Container
) -> None:
    container.limiters["scan"].limit = 2
    img = make_jpeg(200, 200)
    for _ in range(2):
        assert (await client.post("/v1/scan", files={"image": ("a.jpg", img)})).status_code == 200
    blocked = await client.post("/v1/scan", files={"image": ("a.jpg", img)})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1
    other_user = await client.post(
        "/v1/scan", files={"image": ("a.jpg", img)}, headers={"x-test-uid": "someone-else"}
    )
    assert other_user.status_code == 200


async def test_scan_when_models_missing(client: httpx.AsyncClient, container: Container) -> None:
    container.scan.pipeline = None
    res = await client.post("/v1/scan", files={"image": ("a.jpg", make_jpeg(100, 100))})
    assert res.status_code == 503 and res.json()["code"] == "models_unavailable"
    assert (await client.get("/v1/health/ready")).status_code == 503


async def test_search_dishes_and_pantry(client: httpx.AsyncClient) -> None:
    created = await client.post(
        "/v1/pantry",
        json={
            "name": "Mom's pizza",
            "servingG": 150,
            "perServing": {"kcal": 390, "proteinG": 15, "fatG": 14, "carbsG": 50},
        },
    )
    assert created.status_code == 201
    res = await client.get("/v1/foods/search", params={"q": "pizza"})
    assert res.status_code == 200
    results = res.json()["results"]
    assert results[0]["source"] in {"dish", "pantry"}
    sources = {r["source"] for r in results}
    assert {"dish", "pantry"} <= sources
    pantry_hit = next(r for r in results if r["source"] == "pantry")
    assert pantry_hit["per100g"]["kcal"] == 260  # 390 kcal per 150 g


async def test_search_typos_still_find_dishes(client: httpx.AsyncClient) -> None:
    res = await client.get("/v1/foods/search", params={"q": "tiramsu"})
    assert res.json()["results"][0]["name"] == "tiramisu"


@respx.mock
async def test_search_uses_calorieninjas_when_local_hits_are_weak(container: Container) -> None:
    route = respx.get(CalorieNinjasClient.URL).respond(
        json={
            "items": [
                {
                    "name": "chicken shawarma",
                    "calories": 250.0,
                    "serving_size_g": 200.0,
                    "protein_g": 10.0,
                    "fat_total_g": "Only available for premium subscribers.",
                    "carbohydrates_total_g": 28.0,
                }
            ]
        }
    )
    container.search.calorie.api_key = "test-key"
    hits = await container.search.search("chicken shawarma", pantry=[])
    assert route.called
    assert route.calls.last.request.headers["x-api-key"] == "test-key"
    hit = next(h for h in hits if h.source == "calorieninjas")
    assert hit.per100g.kcal == 125 and hit.per100g.fat_g == 0  # non-numeric field ignored
    await container.search.search("chicken shawarma", pantry=[])
    assert route.call_count == 1, "second search served from cache"


@respx.mock
async def test_barcode_lookup(client: httpx.AsyncClient) -> None:
    respx.get(OpenFoodFactsClient.URL.format(code="8901058000290")).respond(
        json={
            "status": 1,
            "product": {
                "product_name": "Masala Oats",
                "brands": "Saffola, Marico",
                "serving_size": "40 g",
                "serving_quantity": 40,
                "nutriscore_grade": "c",
                "nova_group": 4,
                "categories": "Breakfasts, Cereals",
                "nutriments": {
                    "energy-kcal_100g": 390,
                    "proteins_100g": 11,
                    "fat_100g": 8,
                    "carbohydrates_100g": 66,
                },
            },
        }
    )
    res = await client.get("/v1/barcode/8901058000290")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Masala Oats" and body["brand"] == "Saffola"
    assert body["perServing"]["kcal"] == 156  # derived from 40 g when not given
    assert body["nutriScore"] == "c" and body["novaGroup"] == 4
    assert body["group"] == "Breakfasts"


@respx.mock
@pytest.mark.parametrize(
    ("code", "status", "problem"),
    [
        ("12345", 422, "validation_error"),
        ("abcdefghij", 422, "invalid_barcode"),
        ("00000000", 404, "product_not_found"),
    ],
)
async def test_barcode_errors(
    client: httpx.AsyncClient, code: str, status: int, problem: str
) -> None:
    respx.get(OpenFoodFactsClient.URL.format(code="00000000")).respond(404, json={"status": 0})
    res = await client.get(f"/v1/barcode/{code}")
    assert res.status_code == status
    assert res.json()["code"] == problem


@respx.mock
async def test_barcode_upstream_down(client: httpx.AsyncClient) -> None:
    respx.get(OpenFoodFactsClient.URL.format(code="12345678")).mock(
        side_effect=httpx.ConnectError("down")
    )
    res = await client.get("/v1/barcode/12345678")
    assert res.status_code == 502 and res.json()["code"] == "upstream_unavailable"
