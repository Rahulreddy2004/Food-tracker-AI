#!/usr/bin/env bash
# Build the website for an API at API_URL and deploy it to Firebase Hosting, with the Firestore
# rules and indexes. Works on the free Spark plan (no Cloud Run, no Storage).
#
#   scripts/deploy-hosting.sh https://my-pc.tail1234.ts.net
#
# One-time: npx firebase-tools@15 login --no-localhost
#           (cd web && pnpm exec playwright install --with-deps chromium)   # prerenders the landing page
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FIREBASE_PROJECT_ID:-food-tracker-8baa9}"
SITE="https://$PROJECT.web.app"
api="${1:-}"
api="${api%/}"
if [[ ! "$api" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "usage: scripts/deploy-hosting.sh <the API's https address, e.g. https://my-pc.tail1234.ts.net>" >&2
  exit 1
fi

echo "▸ Checking the API at $api"
if ! curl -fsS --max-time 20 "$api/v1/health/ready" >/dev/null; then
  echo "  The API isn't answering at $api/v1/health/ready." >&2
  echo "  Start scripts/serve-public.sh and the tunnel first, then run this again." >&2
  exit 1
fi
for f in web/.env web/.env.local web/.env.production web/.env.production.local; do
  if grep -qs "EMULATOR" "$f"; then
    echo "  $f points the web app at the emulators; move it aside before deploying." >&2
    exit 1
  fi
done

# The Content-Security-Policy allows the browser to call only this API.
config=firebase.deploy.json
trap 'rm -f "$config"' EXIT
python3 - "$api" "$config" <<'PY'
import json
import sys

api, out = sys.argv[1], sys.argv[2]
with open("firebase.json") as fh:
    cfg = json.load(fh)
patched = 0
for block in cfg["hosting"]["headers"]:
    for header in block["headers"]:
        if header["key"] == "Content-Security-Policy" and "https://*.a.run.app" in header["value"]:
            header["value"] = header["value"].replace("https://*.a.run.app", api)
            patched += 1
if not patched:
    sys.exit("firebase.json has no CSP entry to point at the API")
with open(out, "w") as fh:
    json.dump(cfg, fh, indent=2)
PY

echo "▸ Building the website"
(cd web && pnpm install --frozen-lockfile --silent && VITE_API_URL="$api" pnpm build)

echo "▸ Deploying to Firebase Hosting (project $PROJECT)"
npx --yes firebase-tools@15 deploy --project "$PROJECT" --config "$config" --non-interactive \
  --only hosting,firestore:rules,firestore:indexes --message "manual: $(git rev-parse --short HEAD)"

echo "▸ Checking the live site"
curl -fsS "$SITE/" | grep -q "Snap your plate"
curl -fsSI "$SITE/app" | grep -qi "^content-security-policy:.*$api"
echo "Done: $SITE now talks to $api"
