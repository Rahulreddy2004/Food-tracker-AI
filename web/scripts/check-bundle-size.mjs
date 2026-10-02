// Fails if the JavaScript needed for the first page load grows past the budget (gzip).
// "First load" = the entry module plus every chunk index.html preloads.
//   pnpm build && pnpm size
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 180);
const dist = resolve(import.meta.dirname, "../dist");
const html = readFileSync(resolve(dist, "index.html"), "utf8");
const files = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]));
let total = 0;
for (const file of files) {
  const size = gzipSync(readFileSync(resolve(dist, file))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file}`);
}
const kb = total / 1024;
console.log(`${kb.toFixed(1).padStart(7)} KB  first-load JS (gzip), budget ${BUDGET_KB} KB`);
if (kb > BUDGET_KB) {
  console.error("Over budget. Lazy-load the heavy part or raise the budget on purpose.");
  process.exit(1);
}
