import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { api, createUser, expectAccessible, signIn, todayInIndia, uniqueEmail } from "./helpers";

const PHOTO = resolve(import.meta.dirname, "../public/images/palak-paneer-640.webp");

test("landing and auth pages are accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Snap your plate");
  await expectAccessible(page, "landing");
  await page.goto("/sign-up");
  await expectAccessible(page, "sign-up");
  await page.goto("/sign-in");
  await expectAccessible(page, "sign-in");
});

test("sign up, onboard and land on Today", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your first name").fill("Ravi");
  await page.getByLabel("Email").fill(uniqueEmail("signup"));
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/welcome");
  await expectAccessible(page, "welcome");

  await page.getByRole("radio", { name: /Build muscle/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Year of birth").fill("2003");
  await page.getByLabel("Height (cm)").fill("178");
  await page.getByLabel("Weight (kg)").fill("70");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Mifflin–St Jeor")).toBeVisible();
  await page.getByRole("button", { name: /Start tracking/ }).click();

  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ravi");
  await expect(page.getByRole("img", { name: /kcal eaten/ })).toBeVisible();
  await expectAccessible(page, "today");
});

test("scan a photo, correct a guess and log the meal", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await page.goto("/app/scan?source=upload&meal=lunch");
  await page.locator('input[type="file"]').setInputFiles(PHOTO);

  await expect(page.getByRole("heading", { name: "I found 3 foods" })).toBeVisible();
  await expectAccessible(page, "scan review");
  // Item 2: pick the second guess. Item 3 was unsure: keep the model's guess.
  await page
    .getByRole("radiogroup", { name: "What is item 2?" })
    .getByRole("radio", { name: /Greek salad/ })
    .click();
  await page.getByRole("button", { name: /keep “French fries”/ }).click();
  await expect(page.getByRole("button", { name: "Log meal", exact: true })).toBeVisible();
  const portion = page.getByLabel("Portion").first();
  await portion.fill("150");
  await page.getByRole("button", { name: "Log meal", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Logged to lunch/ })).toBeVisible();
  await expect(page.getByText("Nutri's take")).toBeVisible();
  await expectAccessible(page, "scan saved");
  await page.getByRole("link", { name: /See today/ }).click();
  await expect(
    page.getByRole("heading", { name: "Pizza, Greek salad, French fries" }),
  ).toBeVisible();
});

test("diary: edit a meal, delete it and undo", async ({ page }) => {
  const user = await createUser();
  await api(user.token, "POST", "/v1/meals", {
    localDate: todayInIndia(),
    mealType: "dinner",
    source: "manual",
    items: [
      {
        name: "steak",
        display: "Steak",
        grams: 200,
        per100g: { kcal: 271, proteinG: 25, fatG: 19, carbsG: 0 },
      },
    ],
  });
  await signIn(page, user);
  await page.goto("/app/diary");
  await expect(page.getByRole("heading", { name: "Steak" })).toBeVisible();
  await expectAccessible(page, "diary");

  await page.getByRole("button", { name: "Options for Steak" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Steak grams").fill("100");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Meal updated")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Steak" })).toContainText("271");

  await page.getByRole("button", { name: "Options for Steak" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Steak" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Steak" })).toBeVisible();
});

test("pantry: save a food and log it in one tap", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await page.goto("/app/pantry");
  await page
    .getByRole("button", { name: /Add (a|your first) food/ })
    .first()
    .click();
  await page.getByLabel("Name").fill("Masala dosa");
  await page.getByLabel("Serving", { exact: true }).fill("1 dosa");
  await page.getByLabel("Serving weight (g)").fill("250");
  await page.getByLabel("Calories").fill("400");
  await page.getByLabel("Protein g").fill("8");
  await page.getByLabel("Carbs g").fill("58");
  await page.getByLabel("Fat g").fill("15");
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Masala dosa", { exact: true })).toBeVisible();
  await expectAccessible(page, "pantry");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Masala dosa logged")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Masala dosa" })).toBeVisible();
});

test("barcode: look up a product by number and log it", async ({ page }) => {
  const user = await createUser();
  // The API's Open Food Facts client is covered by API tests; here we stub its response.
  await page.route("**/v1/barcode/**", (route) =>
    route.fulfill({
      json: {
        code: "8901058000290",
        name: "Masala Oats",
        brand: "Saffola",
        imageUrl: null,
        group: "Breakfasts",
        servingG: 40,
        servingLabel: "40 g",
        per100g: { kcal: 390, proteinG: 11, fatG: 8, carbsG: 66 },
        perServing: { kcal: 156, proteinG: 4.4, fatG: 3.2, carbsG: 26.4 },
        nutriScore: "c",
        novaGroup: 4,
      },
    }),
  );
  await signIn(page, user);
  await page.goto("/app/barcode");
  await page.getByLabel("Barcode number").fill("8901058000290");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByRole("heading", { name: "Masala Oats" })).toBeVisible();
  await expect(page.getByLabel("Nutri-Score C")).toBeVisible();
  await expectAccessible(page, "barcode product");
  await page.getByRole("button", { name: "More", exact: true }).click(); // 1.5 servings
  await expect(page.getByText("= 60 g")).toBeVisible();
  await page.getByRole("button", { name: "Log to diary" }).click();
  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: "Masala Oats (Saffola)" })).toBeVisible();
});

test("coach replies are streamed and kept in the thread", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await page.goto("/app/coach");
  await expectAccessible(page, "coach");
  await page.getByLabel("Message Nutri").fill("Ideas for a light dinner?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/palm-sized portion of protein/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ideas for a light dinner?", { exact: true })).toBeVisible();
  await expect(page.getByText(/palm-sized portion of protein/)).toBeVisible();
});

test("settings: change the calorie goal and switch to dark mode", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await page.goto("/app/settings");
  await expectAccessible(page, "settings");
  await page.getByLabel("Calories").fill("1800");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.getByRole("radio", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/app");
  await expect(page.getByRole("img", { name: /of 1,800 kcal eaten/ })).toBeVisible();
  await expectAccessible(page, "today (dark)");
});

test("insights show trends once meals exist", async ({ page }) => {
  const user = await createUser();
  for (const mealType of ["breakfast", "lunch"]) {
    await api(user.token, "POST", "/v1/meals", {
      localDate: todayInIndia(),
      mealType,
      source: "manual",
      items: [
        {
          name: "pancakes",
          display: "Pancakes",
          grams: 150,
          per100g: { kcal: 227, proteinG: 6.4, fatG: 9.7, carbsG: 28.3 },
        },
      ],
    });
  }
  await signIn(page, user);
  await page.goto("/app/insights");
  await expect(page.getByRole("heading", { name: "Calories per day" })).toBeVisible();
  await expect(page.getByText("Pancakes")).toBeVisible();
  await expectAccessible(page, "insights");
});
