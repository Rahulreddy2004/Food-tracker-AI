#!/usr/bin/env bash
# Smoke-test a running API (local container or Cloud Run).
#
#   scripts/smoke.sh https://food-tracker-api-xxxx.a.run.app
#   SMOKE_ORIGIN=https://food-tracker-8baa9.web.app scripts/smoke.sh <url>      # also checks CORS
#   SMOKE_ID_TOKEN=<firebase id token> scripts/smoke.sh <url>                   # also scans a photo
#   SMOKE_AUTH_EMULATOR=127.0.0.1:9099 scripts/smoke.sh <url>                   # makes its own user
#
# Exits non-zero on the first failed check.
set -euo pipefail

BASE="${1:?usage: smoke.sh <api base url>}"
BASE="${BASE%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHOTO="${SMOKE_PHOTO:-$ROOT/api/tests/fixtures/palak_paneer.jpg}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; [[ -f "$TMP/body" ]] && head -c 600 "$TMP/body" >&2 && echo >&2; exit 1; }

# request METHOD PATH [curl args...] -> prints the HTTP status, body in $TMP/body
request() {
  local method="$1" path="$2"
  shift 2
  curl -sS --max-time 60 -o "$TMP/body" -w '%{http_code}' -X "$method" "$@" "$BASE$path"
}

json() { python3 -c "import json,sys; d=json.load(open('$TMP/body')); print($1)"; }

echo "Smoke test: $BASE"

status=$(request GET /v1/health/live)
[[ "$status" == 200 ]] || fail "live: HTTP $status"
pass "live"

# Cold starts on Cloud Run can take a few seconds while the models load.
for _ in $(seq 1 30); do
  status=$(request GET /v1/health/ready) || true
  [[ "$status" == 200 ]] && break
  sleep 2
done
[[ "$status" == 200 ]] || fail "ready: HTTP $status"
[[ "$(json "d['models']")" == True ]] || fail "ready: models not loaded"
pass "ready (models loaded, coach $(json "'on' if d['coach'] else 'off'"))"

status=$(request GET /v1/meals)
[[ "$status" == 401 ]] || fail "meals without a token should be 401, got $status"
[[ "$(json "d['code']")" == unauthenticated ]] || fail "401 is not problem+json"
pass "auth required (problem+json)"

grep -qi '^x-request-id:' <(curl -sS -D - -o /dev/null "$BASE/v1/health/live") || fail "no X-Request-ID header"
pass "request id header"

if [[ -n "${SMOKE_ORIGIN:-}" ]]; then
  allowed=$(curl -sS -o /dev/null -D - -X OPTIONS "$BASE/v1/scan" \
    -H "Origin: $SMOKE_ORIGIN" -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization' | tr -d '\r' |
    awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
  [[ "$allowed" == "$SMOKE_ORIGIN" ]] || fail "CORS: $SMOKE_ORIGIN not allowed (got '${allowed:-none}')"
  pass "CORS allows $SMOKE_ORIGIN"
fi

TOKEN="${SMOKE_ID_TOKEN:-}"
if [[ -z "$TOKEN" && -n "${SMOKE_AUTH_EMULATOR:-}" ]]; then
  email="smoke-$(date +%s)-$RANDOM@example.com"
  TOKEN=$(curl -sS -X POST -H 'Content-Type: application/json' \
    "http://$SMOKE_AUTH_EMULATOR/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
    -d "{\"email\":\"$email\",\"password\":\"smoke-pass-123\",\"returnSecureToken\":true}" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["idToken"])')
  pass "emulator user $email"
fi

if [[ -n "$TOKEN" ]]; then
  auth=(-H "Authorization: Bearer $TOKEN")

  status=$(request GET /v1/me/profile "${auth[@]}")
  [[ "$status" == 200 ]] || fail "profile: HTTP $status"
  pass "profile"

  status=$(request POST /v1/scan "${auth[@]}" -F "image=@$PHOTO;type=image/jpeg")
  [[ "$status" == 200 ]] || fail "scan: HTTP $status"
  items=$(json "len(d['items'])")
  (( items > 0 )) || fail "scan returned no items"
  pass "scan: $items item(s), top guess $(json "d['items'][0]['predictions'][0]['display']") in $(json "d['timings']['totalMs']") ms ($(json "d['models']['detector']"))"

  today=$(date +%F)
  meal=$(python3 - "$TMP/body" "$today" <<'PY'
import json, sys
scan = json.load(open(sys.argv[1]))
p = scan["items"][0]["predictions"][0]
print(json.dumps({
    "localDate": sys.argv[2], "mealType": "lunch", "source": "scan",
    "items": [{"name": p["label"], "label": p["label"], "display": p["display"],
               "group": p["group"], "confidence": p["confidence"], "estimatedGrams": p["suggestedGrams"],
               "grams": p["suggestedGrams"], "per100g": p["per100g"]}],
}))
PY
)
  status=$(request POST /v1/meals "${auth[@]}" -H 'Content-Type: application/json' -d "$meal")
  [[ "$status" == 201 ]] || fail "create meal: HTTP $status"
  meal_id=$(json "d['id']")
  pass "meal saved ($(json "round(d['totals']['kcal'])") kcal)"

  status=$(request GET "/v1/meals?from=$today&to=$today" "${auth[@]}")
  [[ "$status" == 200 && "$(json "any(m['id'] == '$meal_id' for m in d['meals'])")" == True ]] ||
    fail "meal not listed"
  pass "meal listed"

  status=$(request DELETE "/v1/meals/$meal_id" "${auth[@]}")
  [[ "$status" == 204 ]] || fail "delete meal: HTTP $status"
  pass "meal deleted"
else
  echo "  (no SMOKE_ID_TOKEN or SMOKE_AUTH_EMULATOR: skipped the signed-in checks)"
fi

echo "Smoke test passed."
