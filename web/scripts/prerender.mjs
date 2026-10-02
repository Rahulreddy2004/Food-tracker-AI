// Prerender the public landing page into dist/index.html so it paints before any JavaScript runs.
// The untouched SPA shell is kept as dist/app.html; Firebase Hosting serves it for every app route.
//   (runs as part of `pnpm build`)
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { preview } from "vite";

const dist = resolve(import.meta.dirname, "../dist");
const indexFile = resolve(dist, "index.html");
copyFileSync(indexFile, resolve(dist, "app.html"));

const server = await preview({
  preview: { port: 4321, strictPort: true, host: "127.0.0.1" },
  logLevel: "silent",
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  // Prerender as a signed-out visitor; never hit real backends while building.
  await page.route(/\/__\/firebase\/init\.json|identitytoolkit|securetoken|googleapis/, (r) =>
    r.abort(),
  );
  await page.goto("http://127.0.0.1:4321/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  const markup = await page.locator("#root").innerHTML();
  const html = readFileSync(indexFile, "utf8").replace(
    '<div id="root"></div>',
    `<div id="root">${markup}</div>`,
  );
  if (!html.includes("Snap your plate"))
    throw new Error("Prerender did not capture the landing page");
  writeFileSync(indexFile, html);
  console.log(
    `prerendered / (${(markup.length / 1024).toFixed(1)} KB of HTML); SPA shell → dist/app.html`,
  );
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
