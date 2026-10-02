#!/usr/bin/env bash
# Run the whole app locally with no cloud accounts:
#   Firebase emulators (Auth, Firestore, Storage) + API + web dev server.
#
#   scripts/dev-stack.sh            # fake models (no weights needed) and a fake coach
#   MODEL_BACKEND=onnx scripts/dev-stack.sh   # real models from api/models
#   LLM_BACKEND=gemini GEMINI_API_KEY=... scripts/dev-stack.sh
#
# Open http://localhost:5173 and create any account (emulator accounts are local only).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=demo-foodtracker
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export STORAGE_EMULATOR_HOST=http://127.0.0.1:9199

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

firebase emulators:start --project "$PROJECT" --only auth,firestore,storage &
pids+=($!)

until curl -sf http://127.0.0.1:9099 >/dev/null && curl -sf http://127.0.0.1:8080 >/dev/null; do sleep 1; done

(
  cd api
  ENV=development DATA_BACKEND=firestore FIREBASE_PROJECT_ID=$PROJECT \
  STORAGE_BUCKET=$PROJECT.appspot.com \
  MODEL_BACKEND="${MODEL_BACKEND:-fake}" LLM_BACKEND="${LLM_BACKEND:-fake}" \
  CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}" \
  uv run uvicorn app.main:app --port 8000 --reload
) &
pids+=($!)

(
  cd web
  VITE_API_URL=http://127.0.0.1:8000 \
  VITE_FIREBASE_PROJECT_ID=$PROJECT \
  VITE_FIREBASE_STORAGE_BUCKET=$PROJECT.appspot.com \
  VITE_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099 \
  VITE_FIREBASE_STORAGE_EMULATOR=127.0.0.1:9199 \
  pnpm dev --host 127.0.0.1
) &
pids+=($!)

wait
