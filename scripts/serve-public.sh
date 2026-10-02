#!/usr/bin/env bash
# Run the API on this machine against the real Firebase project. This is the free (Spark plan)
# setup: the website on Firebase Hosting calls this API through a public HTTPS tunnel such as
# Tailscale Funnel, so the app works while this machine and the tunnel are running.
#
#   GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/food-tracker-sa.json scripts/serve-public.sh
#
# Needs: a Firebase service-account key file (Project settings → Service accounts), the model
# files (python3 scripts/fetch_models.py) and the API keys in api/.env. Meal photos stay off:
# Cloud Storage needs the Blaze plan.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FIREBASE_PROJECT_ID:-food-tracker-8baa9}"
KEY="${GOOGLE_APPLICATION_CREDENTIALS:-}"

if [[ -z "$KEY" || ! -f "$KEY" ]]; then
  echo "Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key file, e.g." >&2
  echo "  GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/food-tracker-sa.json scripts/serve-public.sh" >&2
  exit 1
fi
case "$(realpath "$KEY")" in
  "$(pwd)"/*) echo "Keep the key file outside the repository (e.g. ~/.secrets/)." >&2; exit 1 ;;
esac
if [[ ! -f api/models/siglip2_vision.onnx || ! -f api/models/siglip2_dishes.npz ]]; then
  echo "The model files are missing: run python3 scripts/fetch_models.py first." >&2
  exit 1
fi
if ! grep -qs '^GEMINI_API_KEY=.' api/.env; then
  echo "Note: no GEMINI_API_KEY in api/.env, so the coach won't answer." >&2
fi

# Never talk to the local emulators from here.
unset FIREBASE_AUTH_EMULATOR_HOST FIRESTORE_EMULATOR_HOST STORAGE_EMULATOR_HOST
export GOOGLE_APPLICATION_CREDENTIALS="$KEY"

echo "API for https://$PROJECT.web.app on http://127.0.0.1:${PORT:-8000} (Ctrl+C to stop)"
cd api
ENV=production DATA_BACKEND=firestore MODEL_BACKEND=onnx LLM_BACKEND=gemini \
  FIREBASE_PROJECT_ID="$PROJECT" STORAGE_BUCKET="" \
  CORS_ORIGINS="https://$PROJECT.web.app,https://$PROJECT.firebaseapp.com" \
  exec uv run uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}" --no-access-log
