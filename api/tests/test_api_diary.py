from __future__ import annotations

from typing import Any

import httpx


def meal_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "localDate": "2026-10-02",
        "mealType": "lunch",
        "source": "scan",
        "items": [
            {
                "name": "pizza",
                "display": "Pizza",
                "group": "Pizza",
                "label": "pizza",
                "confidence": 0.82,
                "grams": 150,
                "estimatedGrams": 200,
                "per100g": {"kcal": 266, "proteinG": 11.4, "fatG": 10.4, "carbsG": 33},
                "box": {"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.6},
            },
            {
                "name": "caesar_salad",
                "display": "Caesar salad",
                "grams": 100,
                "per100g": {"kcal": 145, "proteinG": 5.5, "fatG": 11.5, "carbsG": 6.5},
            },
        ],
    }
    body.update(overrides)
    return body


async def test_meal_crud_and_server_side_totals(client: httpx.AsyncClient) -> None:
    created = await client.post("/v1/meals", json=meal_body())
    assert created.status_code == 201, created.text
    meal = created.json()
    assert meal["items"][0]["nutrition"]["kcal"] == 399  # 266 × 1.5
    assert meal["totals"]["kcal"] == 544  # 399 + 145
    assert meal["totals"]["proteinG"] == 22.6

    listed = await client.get("/v1/meals", params={"from": "2026-10-01", "to": "2026-10-02"})
    assert [m["id"] for m in listed.json()["meals"]] == [meal["id"]]

    patched = await client.patch(
        f"/v1/meals/{meal['id']}",
        json={"mealType": "dinner", "items": [meal_body()["items"][1]]},
    )
    assert patched.status_code == 200
    assert patched.json()["mealType"] == "dinner"
    assert patched.json()["totals"]["kcal"] == 145

    assert (await client.delete(f"/v1/meals/{meal['id']}")).status_code == 204
    assert (await client.get(f"/v1/meals/{meal['id']}")).status_code == 404
    assert (await client.delete(f"/v1/meals/{meal['id']}")).status_code == 404


async def test_meals_are_private_per_user(client: httpx.AsyncClient) -> None:
    meal = (await client.post("/v1/meals", json=meal_body())).json()
    other = {"x-test-uid": "intruder"}
    assert (await client.get(f"/v1/meals/{meal['id']}", headers=other)).status_code == 404
    assert (await client.delete(f"/v1/meals/{meal['id']}", headers=other)).status_code == 404
    listed = await client.get(
        "/v1/meals", params={"from": "2026-10-01", "to": "2026-10-31"}, headers=other
    )
    assert listed.json()["meals"] == []


async def test_meal_validation(client: httpx.AsyncClient) -> None:
    bad_photo = await client.post(
        "/v1/meals", json=meal_body(photoPath="users/someone-else/x.webp")
    )
    assert bad_photo.status_code == 422 and bad_photo.json()["code"] == "invalid_photo_path"
    ok_photo = await client.post("/v1/meals", json=meal_body(photoPath="users/user-1/meals/a.webp"))
    assert ok_photo.status_code == 201
    empty = await client.post("/v1/meals", json=meal_body(items=[]))
    assert empty.status_code == 422 and empty.json()["code"] == "validation_error"
    huge = meal_body()
    huge["items"][0]["grams"] = 99999
    assert (await client.post("/v1/meals", json=huge)).status_code == 422
    unknown_field = meal_body(hacker=True)
    assert (await client.post("/v1/meals", json=unknown_field)).status_code == 422
    nothing = await client.patch("/v1/meals/whatever", json={})
    assert nothing.status_code == 422


async def test_ranges_and_daily_summary(client: httpx.AsyncClient) -> None:
    await client.post("/v1/meals", json=meal_body(localDate="2026-09-30"))
    await client.post("/v1/meals", json=meal_body(localDate="2026-10-02", mealType="breakfast"))
    await client.post("/v1/meals", json=meal_body(localDate="2026-10-02"))
    res = await client.get("/v1/summary/daily", params={"from": "2026-09-30", "to": "2026-10-02"})
    days = res.json()["days"]
    assert [d["date"] for d in days] == ["2026-09-30", "2026-10-01", "2026-10-02"]
    assert [d["meals"] for d in days] == [1, 0, 2]
    assert days[1]["totals"]["kcal"] == 0
    assert days[2]["totals"]["kcal"] == 1088

    backwards = await client.get("/v1/meals", params={"from": "2026-10-02", "to": "2026-10-01"})
    assert backwards.status_code == 422 and backwards.json()["code"] == "invalid_range"
    too_long = await client.get(
        "/v1/summary/daily", params={"from": "2024-01-01", "to": "2026-01-01"}
    )
    assert too_long.status_code == 422


async def test_pantry_crud(client: httpx.AsyncClient) -> None:
    body = {
        "name": "Masala dosa",
        "servingG": 250,
        "servingLabel": "1 dosa",
        "perServing": {"kcal": 400, "proteinG": 8, "fatG": 15, "carbsG": 58},
    }
    created = (await client.post("/v1/pantry", json=body)).json()
    assert created["per100g"]["kcal"] == 160
    updated = await client.patch(
        f"/v1/pantry/{created['id']}", json={"servingG": 200, "favorite": True}
    )
    assert updated.json()["per100g"]["kcal"] == 200 and updated.json()["favorite"] is True
    assert [f["name"] for f in (await client.get("/v1/pantry")).json()["foods"]] == ["Masala dosa"]
    assert (await client.delete(f"/v1/pantry/{created['id']}")).status_code == 204
    assert (await client.get("/v1/pantry")).json()["foods"] == []


async def test_profile_defaults_and_updates(client: httpx.AsyncClient) -> None:
    default = (await client.get("/v1/me/profile")).json()
    assert default["onboarded"] is False and default["targets"]["kcal"] == 2000
    assert default["displayName"] == "Test User"
    body = {
        "displayName": "Rahul",
        "goal": "lose",
        "targets": {"kcal": 1800, "proteinG": 120, "fatG": 60, "carbsG": 190},
        "body": {
            "sex": "male",
            "birthYear": 2004,
            "heightCm": 175,
            "weightKg": 72,
            "activity": "moderate",
        },
        "units": "metric",
        "timezone": "Asia/Kolkata",
        "onboarded": True,
    }
    saved = await client.put("/v1/me/profile", json=body)
    assert saved.status_code == 200 and saved.json()["createdAt"]
    assert (await client.get("/v1/me/profile")).json()["timezone"] == "Asia/Kolkata"
    bad_tz = await client.put("/v1/me/profile", json={**body, "timezone": "Mars/Olympus"})
    assert bad_tz.status_code == 422
    too_low = await client.put(
        "/v1/me/profile", json={**body, "targets": {**body["targets"], "kcal": 300}}
    )
    assert too_low.status_code == 422


async def test_export_and_delete_account(client: httpx.AsyncClient) -> None:
    await client.post("/v1/meals", json=meal_body())
    export = await client.get("/v1/me/export")
    assert export.status_code == 200
    assert "attachment" in export.headers["content-disposition"]
    data = export.json()
    assert data["format"] == "food-tracker-export" and len(data["meals"]) == 1
    assert (await client.delete("/v1/me")).status_code == 204
    after = await client.get("/v1/meals", params={"from": "2026-10-01", "to": "2026-10-31"})
    assert after.json()["meals"] == []
