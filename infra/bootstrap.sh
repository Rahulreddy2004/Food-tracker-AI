#!/usr/bin/env bash
# One-time Google Cloud setup so GitHub Actions can deploy without any stored key.
# Safe to re-run: every step checks before it creates.
#
#   gcloud auth login
#   infra/bootstrap.sh                       # project food-tracker-8baa9, region asia-south1
#   ROTATE_SECRETS=1 infra/bootstrap.sh      # also add new versions of the API keys
#
# Needs: the Firebase project on the Blaze plan, Storage enabled in the Firebase console, and
# Owner (or equivalent) on the project for the account running this.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-food-tracker-8baa9}"
REGION="${REGION:-asia-south1}"
GITHUB_REPO="${GITHUB_REPO:-Rahulreddy2004/Food-tracker-AI}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
AR_REPO=food-tracker
RUNTIME_SA="food-tracker-api@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
POOL=github
PROVIDER=github-oidc
BUCKET="gs://${PROJECT_ID}.firebasestorage.app"
SECRETS=(gemini-api-key calorieninjas-api-key)

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
quiet() { "$@" >/dev/null 2>&1; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

step "Enabling APIs"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  firestore.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  firebaserules.googleapis.com identitytoolkit.googleapis.com storage.googleapis.com

step "Artifact Registry repository ${AR_REPO} (${REGION})"
if ! quiet gcloud artifacts repositories describe "$AR_REPO" --location "$REGION"; then
  gcloud artifacts repositories create "$AR_REPO" --location "$REGION" \
    --repository-format docker --description "Food Tracker API images"
fi
# Keep the 10 newest images; delete older ones after 30 days.
policy="$(mktemp)"
cat >"$policy" <<'JSON'
[
  {"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 10}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "30d"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location "$REGION" \
  --policy "$policy" --no-dry-run >/dev/null
rm -f "$policy"

step "Service accounts"
for sa in "$RUNTIME_SA" "$DEPLOY_SA"; do
  name="${sa%%@*}"
  if ! quiet gcloud iam service-accounts describe "$sa"; then
    gcloud iam service-accounts create "$name" --display-name "$name"
  fi
done

bind_project() {  # member role
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "$1" --role "$2" \
    --condition None >/dev/null
  echo "  $2 → ${1#serviceAccount:}"
}

step "Runtime permissions (what the API can touch)"
bind_project "serviceAccount:$RUNTIME_SA" roles/datastore.user          # Firestore data
bind_project "serviceAccount:$RUNTIME_SA" roles/firebaseauth.admin      # delete account
if quiet gcloud storage buckets describe "$BUCKET"; then
  gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member "serviceAccount:$RUNTIME_SA" --role roles/storage.objectAdmin >/dev/null
  echo "  roles/storage.objectAdmin on $BUCKET (meal photos, account deletion)"
else
  echo "  ! $BUCKET not found: enable Storage in the Firebase console, then re-run" >&2
fi

step "Secrets (values are read from the terminal and never echoed)"
for secret in "${SECRETS[@]}"; do
  new=0
  if ! quiet gcloud secrets describe "$secret"; then
    gcloud secrets create "$secret" --replication-policy automatic >/dev/null
    new=1
  fi
  if [[ "$new" == 1 || "${ROTATE_SECRETS:-0}" == 1 ]]; then
    read -rsp "  Value for $secret: " value
    echo
    [[ -n "$value" ]] || { echo "  ! empty value, skipped $secret" >&2; continue; }
    printf '%s' "$value" | gcloud secrets versions add "$secret" --data-file - >/dev/null
    unset value
    echo "  stored a new version of $secret"
  else
    echo "  $secret exists (ROTATE_SECRETS=1 to replace it)"
  fi
  gcloud secrets add-iam-policy-binding "$secret" \
    --member "serviceAccount:$RUNTIME_SA" --role roles/secretmanager.secretAccessor >/dev/null
done

step "Deployer permissions (what GitHub Actions can do)"
bind_project "serviceAccount:$DEPLOY_SA" roles/run.admin
bind_project "serviceAccount:$DEPLOY_SA" roles/firebasehosting.admin
bind_project "serviceAccount:$DEPLOY_SA" roles/firebaserules.admin
bind_project "serviceAccount:$DEPLOY_SA" roles/datastore.indexAdmin
bind_project "serviceAccount:$DEPLOY_SA" roles/serviceusage.serviceUsageConsumer
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
echo "  roles/artifactregistry.writer on $AR_REPO"
# Deploying a service that runs as the runtime account requires acting as it.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null
echo "  roles/iam.serviceAccountUser on ${RUNTIME_SA%%@*}"

step "Workload Identity Federation for ${GITHUB_REPO} (${DEPLOY_BRANCH} only)"
if ! quiet gcloud iam workload-identity-pools describe "$POOL" --location global; then
  gcloud iam workload-identity-pools create "$POOL" --location global \
    --display-name "GitHub Actions"
fi
condition="assertion.repository=='${GITHUB_REPO}' && assertion.ref=='refs/heads/${DEPLOY_BRANCH}'"
if ! quiet gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location global --workload-identity-pool "$POOL"; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location global --workload-identity-pool "$POOL" \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "$condition"
else
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" \
    --location global --workload-identity-pool "$POOL" --attribute-condition "$condition" >/dev/null
fi
pool_id="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${pool_id}/attribute.repository/${GITHUB_REPO}" >/dev/null

provider_id="${pool_id}/providers/${PROVIDER}"
step "Done. Add these as GitHub repository variables (Settings → Secrets and variables → Actions → Variables):"
cat <<EOF
  GCP_PROJECT_ID                  ${PROJECT_ID}
  GCP_REGION                      ${REGION}
  GCP_WORKLOAD_IDENTITY_PROVIDER  ${provider_id}
  GCP_DEPLOY_SERVICE_ACCOUNT      ${DEPLOY_SA}

or, with the GitHub CLI:
  gh variable set GCP_PROJECT_ID --body ${PROJECT_ID} --repo ${GITHUB_REPO}
  gh variable set GCP_REGION --body ${REGION} --repo ${GITHUB_REPO}
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body ${provider_id} --repo ${GITHUB_REPO}
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --body ${DEPLOY_SA} --repo ${GITHUB_REPO}

None of these are secrets. No service-account key was created.
EOF
