import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const AUTH = process.env.AUTH_EMULATOR ?? "http://127.0.0.1:9099";
const API = process.env.API_URL ?? "http://127.0.0.1:8000";

export interface TestUser {
  email: string;
  password: string;
  token: string;
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Create a user in the Auth emulator (and optionally an onboarded profile through the API). */
export async function createUser(
  opts: { onboarded?: boolean; name?: string } = {},
): Promise<TestUser> {
  const email = uniqueEmail();
  const password = "secret123";
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName: opts.name ?? "Asha",
        returnSecureToken: true,
      }),
    },
  );
  expect(res.ok).toBeTruthy();
  const { idToken } = (await res.json()) as { idToken: string };
  if (opts.onboarded !== false) {
    await api(idToken, "PUT", "/v1/me/profile", {
      displayName: opts.name ?? "Asha",
      goal: "maintain",
      targets: { kcal: 2000, proteinG: 100, fatG: 67, carbsG: 250 },
      timezone: "Asia/Kolkata",
      units: "metric",
      onboarded: true,
    });
  }
  return { email, password, token: idToken };
}

export async function api<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function signIn(page: Page, user: TestUser, expectPath = "/app"): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**${expectPath}`);
}

/**
 * Wait for entrance animations to finish, so contrast is measured on the final colours rather than
 * mid-fade (slow CI runners catch fades that a fast machine never shows). Looping animations such
 * as skeleton shimmer are ignored.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const running = document
        .getAnimations()
        .some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);
      if (running) return false;
      // JS-driven tweens (motion) write inline opacity while they run.
      return [...document.querySelectorAll<HTMLElement>("[style*='opacity']")].every((el) => {
        const opacity = Number(getComputedStyle(el).opacity);
        return opacity === 0 || opacity === 1;
      });
    },
    undefined,
    { timeout: 5_000 },
  );
}

/** Fail on serious or critical WCAG 2.2 AA violations. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  await settleAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.slice(0, 4).map((n) => {
        const data = (n.any[0]?.data ?? {}) as {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
        };
        const contrast = data.contrastRatio
          ? ` (${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1)`
          : "";
        return `${v.id}${contrast} → ${n.target.join(" ")} :: ${n.html.slice(0, 90)}`;
      }),
    );
  expect(blocking, `accessibility problems on ${label}`).toEqual([]);
}

export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
