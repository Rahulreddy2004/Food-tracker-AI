// Fail the build when an inline <script> in dist/*.html is not allowed by the CSP in firebase.json.
// (The theme bootstrap in index.html runs before first paint, so it is inline and hash-allowed.)
//   (runs as part of `pnpm build`)
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const firebase = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../firebase.json"), "utf8"),
);
const csp = firebase.hosting.headers
  .flatMap((rule) => rule.headers)
  .find((h) => h.key === "Content-Security-Policy")?.value;
if (!csp) throw new Error("firebase.json has no Content-Security-Policy header");
const scriptSrc =
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src ")) ?? "";

const missing = new Set();
for (const file of readdirSync(dist).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(resolve(dist, file), "utf8");
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
    if (!scriptSrc.includes(hash)) missing.add(`${hash} (in ${file})`);
  }
}
if (missing.size) {
  console.error("Inline scripts not allowed by script-src in firebase.json. Add:");
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log("CSP: every inline script is hash-allowed");
