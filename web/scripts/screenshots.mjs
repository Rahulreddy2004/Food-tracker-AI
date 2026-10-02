// Design-review screenshots against the local dev stack (scripts/dev-stack.sh must be running).
//   node scripts/screenshots.mjs [outDir] [--pages landing,auth,welcome,today,...]
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const AUTH = process.env.AUTH_EMULATOR ?? "http://127.0.0.1:9099";
const out = resolve(
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "screenshots",
);
const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
const only = pagesArg ? new Set(pagesArg.slice(8).split(",")) : null;
const want = (name) => !only || only.has(name);
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function signUp(email, password, name) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`sign-up failed: ${await res.text()}`);
  const { idToken } = await res.json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, displayName: name }),
  });
  return idToken;
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function day(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

const item = (name, display, group, grams, kcal, p, f, c) => ({
  name,
  display,
  group,
  label: name,
  grams,
  per100g: { kcal, proteinG: p, fatG: f, carbsG: c },
});

async function seed(token) {
  await api(token, "PUT", "/v1/me/profile", {
    displayName: "Rahul",
    goal: "lose",
    targets: { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 245 },
    timezone: "Asia/Kolkata",
    units: "metric",
    onboarded: true,
  });
  const meals = [
    [
      0,
      "breakfast",
      [
        item("pancakes", "Pancakes", "Breakfast", 150, 227, 6.4, 9.7, 28.3),
        item("omelette", "Omelette", "Breakfast", 120, 155, 10.5, 12, 1),
      ],
    ],
    [
      0,
      "lunch",
      [
        item("caesar_salad", "Caesar salad", "Salad", 220, 145, 5.5, 11.5, 6.5),
        item("garlic_bread", "Garlic bread", "Side Dish", 60, 350, 8, 16, 42),
      ],
    ],
    [-1, "dinner", [item("chicken_curry", "Chicken curry", "Curry", 320, 150, 12, 8.5, 6.5)]],
  ];
  for (let offset = -13; offset <= -2; offset++) {
    meals.push([
      offset,
      "lunch",
      [
        item(
          "fried_rice",
          "Fried rice",
          "Rice Dish",
          250 + ((offset * 37) % 120),
          165,
          4.5,
          5.5,
          25,
        ),
      ],
    ]);
    meals.push([
      offset,
      "dinner",
      [item("pizza", "Pizza", "Pizza", 180 + ((offset * 53) % 160), 266, 11.4, 10.4, 33)],
    ]);
  }
  for (const [offset, mealType, items] of meals) {
    await api(token, "POST", "/v1/meals", {
      localDate: day(offset),
      mealType,
      source: "scan",
      items,
    });
  }
}

async function signInUi(page, email, password) {
  await page.goto(`${WEB}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/app");
}

const browser = await chromium.launch();
const shots = [];
async function capture(page, name, { full = false } = {}) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1600); // let entrance animations settle
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: full });
  shots.push(file);
}

for (const scheme of ["light", "dark"]) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const tag = `${vpName}-${scheme}`;
    // A fresh context per flow: Firebase keeps the session in IndexedDB, not cookies.
    const fresh = async () => {
      const ctx = await browser.newContext({
        viewport,
        colorScheme: scheme,
        deviceScaleFactor: vpName === "mobile" ? 2 : 1,
      });
      return { ctx, page: await ctx.newPage() };
    };

    if (want("landing")) {
      const { ctx, page } = await fresh();
      await page.goto(WEB);
      await capture(page, `landing-${tag}`, { full: vpName === "desktop" && scheme === "light" });
      await ctx.close();
    }
    if (want("auth") && scheme === "light") {
      const { ctx, page } = await fresh();
      await page.goto(`${WEB}/sign-up`);
      await capture(page, `signup-${tag}`);
      await ctx.close();
    }
    if (want("welcome") && scheme === "light") {
      const { ctx, page } = await fresh();
      const email = `new-${Date.now()}-${vpName}@example.com`;
      await signUp(email, "secret123", "Rahul");
      await page.goto(`${WEB}/sign-in`);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("secret123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL("**/welcome");
      await capture(page, `welcome-goal-${tag}`);
      await page.getByRole("radio", { name: /Lose weight/ }).click();
      await page.getByRole("button", { name: /Continue/ }).click();
      await page.getByRole("radio", { name: "Male", exact: true }).click();
      await page.getByLabel("Year of birth").fill("2004");
      await page.getByLabel("Height (cm)").fill("175");
      await page.getByLabel("Weight (kg)").fill("74");
      await page.getByRole("button", { name: /Continue/ }).click();
      await capture(page, `welcome-targets-${tag}`);
      await ctx.close();
    }
    if (want("today")) {
      const { ctx, page } = await fresh();
      const email = `demo-${Date.now()}-${tag}@example.com`;
      const token = await signUp(email, "secret123", "Rahul");
      await seed(token);
      await signInUi(page, email, "secret123");
      await capture(page, `today-${tag}`, { full: vpName === "mobile" });
      if (want("scan")) {
        await page.goto(`${WEB}/app/scan?source=upload`);
        await page
          .locator('input[type="file"]')
          .setInputFiles(resolve("public/images/palak-paneer-640.webp"));
        await page.getByRole("button", { name: /Log meal/ }).waitFor();
        await capture(page, `scan-review-${tag}`, { full: vpName === "mobile" });
      }
      if (want("coach")) {
        await page.goto(`${WEB}/app/coach`);
        await page.getByRole("button", { name: "What should I have for dinner tonight?" }).click();
        await page.getByText("palm-sized").first().waitFor();
        await capture(page, `coach-${tag}`);
      }
      for (const route of (process.env.EXTRA_ROUTES ?? "").split(",").filter(Boolean)) {
        await page.goto(`${WEB}/app/${route}`);
        await capture(page, `${route.replace(/\W+/g, "-")}-${tag}`, { full: vpName === "mobile" });
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(shots.join("\n"));
