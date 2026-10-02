import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the full local stack: Firebase emulators + API (fake models, fake
 * coach) + the web dev server. `scripts/dev-stack.sh` starts all of it; an already-running stack is
 * reused.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "../scripts/dev-stack.sh",
    url: "http://127.0.0.1:8000/v1/health/ready",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
  },
});
