# ADR 0001: Architecture for v2

**Status:** accepted · **Date:** 2026-10-02

## Context

v1 was a Flask app plus a Create React App frontend, written as a prototype. It had real bugs:

- calorie estimates depended on photo resolution
- the models never loaded under gunicorn
- the frontend had crash loops
- API keys were committed

It also had no tests, and both the Gemini SDK and Create React App are deprecated. We want a
product-quality rebuild that keeps the same two trained models.

## Decision

- **Monorepo:**
  - `api/` (FastAPI)
  - `web/` (Vite + React + TypeScript)
  - `ml/` (conversion and evaluation)
  - `infra/` (rules, deploy)
- **API:** FastAPI on Cloud Run, typed end to end:
  - Pydantic models
  - an OpenAPI spec
  - a TypeScript client generated from that spec
- **Data and auth:** Firebase Auth for sign-in, Firestore for data. **Only the API touches
  Firestore**; browser access is denied by the security rules. Browsers use Firebase directly only
  for Auth and for meal-photo uploads to Storage.
- **Web hosting:** the web app is a static PWA on Firebase Hosting. It calls the API on its own
  domain with a CORS allowlist, so streamed responses (the coach chat) work.

## Consequences

- One place enforces data rules and validation (the API), and it is easy to test with in-memory
  repositories and with the Firebase emulators.
- Keeping Firebase means existing accounts survive. `scripts/migrate_v1_to_v2.py` moves the old
  collections into the new `users/{uid}/…` layout.
