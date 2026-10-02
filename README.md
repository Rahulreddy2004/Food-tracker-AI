# Food Tracker

**Snap your plate. Know your food.** Take a photo of a meal; the app finds each dish, names it,
estimates the portion and logs calories and macros. An AI coach that knows your goals helps you
plan what's next.

<p>
  <img src="docs/screenshots/landing.webp" alt="Landing page: headline 'Snap your plate. Know your food.' beside a photo of palak paneer with detected dishes labelled" width="64%">
  <img src="docs/screenshots/scan-review-mobile.webp" alt="Scan review on a phone: the photo with three numbered detection boxes" width="30%">
</p>
<p>
  <img src="docs/screenshots/today.webp" alt="Today screen: calorie ring with 1,045 kcal left, protein/carbs/fat bars, quick actions and today's meals" width="49%">
  <img src="docs/screenshots/insights-dark.webp" alt="Insights in dark mode: stat tiles and a calories-per-day bar chart with the goal line" width="49%">
</p>

## What it does

- **Photo → meal.** A YOLOv8 detector finds each food on the plate and an EfficientNetV2-B3
  classifier (Food-101) names it. You see the top 3 guesses with honest confidence, and items
  the model is unsure about are flagged for you to confirm.
- **Portions you can trust.** Grams are estimated from how much of the photo each dish covers
  (independent of photo resolution), shown as an editable estimate with a slider.
- **Barcode scanning** via Open Food Facts (per 100 g and per serving, Nutri-Score).
- **Diary, insights and pantry.** Edit, move or delete meals with undo; trends over 7/30/90 days;
  your own saved foods.
- **Nutri, the coach.** Gemini, streamed, grounded in your goals and what you ate, with no
  medical claims.
- **Yours to keep or delete.** Export everything as JSON, or delete your account and all data.
- Installable PWA, light and dark themes, WCAG 2.2 AA (checked by axe on every screen).

## How it works

```
Browser — React PWA on Firebase Hosting
  ├─ Firebase Auth ............ sign-in → ID token
  ├─ Firebase Storage ......... meal-photo thumbnails (owner-only rules)
  └─ HTTPS + Bearer token ──▶ API — FastAPI on Cloud Run (asia-south1)
        ├─ scan: decode (EXIF, HEIC) → YOLOv8 detect → crop → EfficientNetV2-B3 classify (one batch)
        │        → top-3 + dedupe → portion estimate → nutrition (local Food-101 table)
        ├─ Firestore ........... profile, meals, pantry, coach thread (API only; clients denied)
        ├─ Gemini .............. coach chat (SSE stream) + a tip after each meal
        ├─ Open Food Facts ..... barcodes
        └─ CalorieNinjas ....... free-text food search (cached)
```

Both models are served with **ONNX Runtime**: the same weights, converted. That keeps the image
small (no TensorFlow or PyTorch) and startup fast, and `ml/parity.py` proves the converted models
give the same answers as the originals. Details: [`ml/MODEL_CARD.md`](ml/MODEL_CARD.md) and
[`docs/adr/`](docs/adr).

## Repository layout

| Path | What's there |
|---|---|
| `api/` | FastAPI service (Python 3.12, uv): `app/{core,ml,services,repositories,routers,schemas,data}`, tests, Dockerfile |
| `web/` | Vite + React 19 + TypeScript app: `src/{app,features,components,lib,styles}`, Vitest and Playwright tests |
| `ml/` | Model conversion (`export_onnx.py`), parity checks, Food-101 evaluation, model card |
| `infra/` | Firestore and Storage rules, Cloud Run service, one-time `bootstrap.sh` |
| `scripts/` | Local stack, model download, smoke test, nutrition table, v1 → v2 migration |
| `.github/workflows/` | `ci.yml` (every push), `models.yml` (manual), `deploy.yml` (main) |

## Run it locally (no cloud accounts needed)

You need Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 22 with pnpm, Java 21 and
`firebase-tools` (for the emulators).

```bash
(cd api && uv sync)
(cd web && pnpm install)
scripts/dev-stack.sh          # Firebase emulators + API + web
```

Open <http://localhost:5173> and create any account; emulator accounts stay on your machine. By
default the API uses deterministic **fake models** and a **fake coach**, so the whole app works
without the weights or any API key.

| To use | Run |
|---|---|
| The real models | `python3 scripts/fetch_models.py`, then `MODEL_BACKEND=onnx scripts/dev-stack.sh` |
| The real coach | `LLM_BACKEND=gemini GEMINI_API_KEY=… scripts/dev-stack.sh` |
| Your own settings | copy `api/.env.example` → `api/.env` and `web/.env.example` → `web/.env.local` |

## Tests and checks

| | Command |
|---|---|
| API lint, types, unit tests | `cd api && uv run ruff check app tests && uv run mypy app && uv run pytest` |
| API against the emulators | `firebase emulators:exec --project demo-foodtracker --only auth,firestore "cd api && FIREBASE_PROJECT_ID=demo-foodtracker uv run pytest -m emulator"` |
| API with the real models | `cd api && uv run pytest -m models` (needs `api/models/*.onnx`) |
| Web lint, types, unit tests | `cd web && pnpm lint && pnpm typecheck && pnpm test` |
| Web build (+ size budget, CSP check) | `cd web && pnpm build && pnpm size` |
| End to end + accessibility | `cd web && pnpm e2e` (starts the local stack itself) |
| A running API | `scripts/smoke.sh <url>` (add `SMOKE_AUTH_EMULATOR=127.0.0.1:9099` locally) |

CI runs all of these on every push, plus a gitleaks secret scan, dependency audits and a build
and boot of the production image.

## The models

| | Detector | Classifier |
|---|---|---|
| Original | `best.pt` (YOLOv8) | `food101_EfficientNetV2B3_final.h5` (Keras, TF 2.19) |
| Served | `best.onnx` | `classifier.onnx` |
| Job | Find each food on the plate | Name it: one of the 101 Food-101 dishes, top 3 |

The weights live on the GitHub Release **`models-v1`**, not in git. The **Models** workflow
(Actions → Models → Run workflow) downloads the originals, converts them, runs the parity check,
optionally measures accuracy on the Food-101 test split, and uploads the ONNX files and a
`SHA256SUMS` file to the same release. `scripts/fetch_models.py` verifies every download against
`api/models/manifest.json` (or the release's `SHA256SUMS`), and deploys use `--strict`.

Honest limits are in the [model card](ml/MODEL_CARD.md): Food-101 is mostly Western restaurant
dishes, a single photo can't measure depth, and every number is an estimate the user can edit.

## Deploying (Cloud Run + Firebase Hosting)

Deploys run from GitHub Actions with **Workload Identity Federation**, so no service-account key
exists anywhere. One-time setup:

1. **Rotate the old keys.** The v1 Gemini and CalorieNinjas keys are in this repo's public git
   history. Revoke them and create new ones.
2. In the Firebase console for `food-tracker-8baa9`: move to the **Blaze** plan, enable
   **Storage**, and enable **Google** and **Email/Password** sign-in.
3. Run the bootstrap with your own account. It asks for the new keys without echoing them and
   stores them in Secret Manager:
   ```bash
   gcloud auth login
   infra/bootstrap.sh
   ```
4. Add the four repository **variables** it prints (Settings → Secrets and variables → Actions).
5. Publish the weights:
   ```bash
   gh release create models-v1 best.pt food101_EfficientNetV2B3_final.h5 \
     --title "Model weights v1" --notes "YOLOv8 detector + EfficientNetV2-B3 Food-101 classifier"
   ```
6. Run **Actions → Models**. Then copy the checksums from its summary into
   `api/models/manifest.json` and commit them.
7. Preview the v1 → v2 data migration (it only reads):
   ```bash
   gcloud auth application-default login
   cd api && FIREBASE_PROJECT_ID=food-tracker-8baa9 uv run python -m app.tools.migrate_v1 --timezone Asia/Kolkata
   ```
8. Merge `v2` into `main`. **Deploy** then:
   1. builds the image with the verified models
   2. deploys Cloud Run and smoke-tests it
   3. builds the web app with a CSP that allows only that API
   4. deploys Hosting plus the Firestore and Storage rules
   5. checks the live site
9. Straight after the first deploy, run the migration for real by adding `--apply` to the step 7
   command. It is idempotent and keeps document ids, so it is safe to run again.

The new rules deny all direct client access to Firestore, so the v1 web app stops working once v2
is live. Run step 9 promptly.

## Security notes

- **Data access:** Firestore is closed to browsers; only the API (its own service account) reads
  and writes. Storage allows each user only their own `users/{uid}/meals/*` images, under 2 MB.
- **Auth:** every API route except health checks a Firebase ID token. Per-user rate limits apply,
  and errors are `application/problem+json`.
- **Hosting headers:** a strict CSP (no inline scripts except one hash-pinned theme snippet, no
  `eval`), plus HSTS and a camera-only Permissions-Policy. `pnpm build` fails if an inline script
  isn't allowed by the CSP.
- **Secrets:** they live only in Secret Manager. Pre-commit and CI run gitleaks.
- **Least privilege:** the deployer can deploy and nothing else, and only from this repository's
  `main` branch.

### Building the image behind a TLS-intercepting proxy

The Dockerfile takes a base image argument, so you can build on a base that trusts your
proxy's CA:

```bash
docker build --build-arg BASE_IMAGE=my-registry/python-with-ca:3.12-slim -t food-tracker-api api
```

## Decisions

Short write-ups in [`docs/adr/`](docs/adr):

1. Architecture for v2: FastAPI, Vite + React, keeping Firebase
2. Serve the same models with ONNX Runtime
3. Resolution-independent portion estimates
