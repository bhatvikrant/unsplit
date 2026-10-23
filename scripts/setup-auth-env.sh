#!/usr/bin/env bash
# Generates a fresh JWT key pair and sets JWT_PRIVATE_KEY, JWKS and SITE_URL.
#   ./scripts/setup-auth-env.sh          -> the deployment in .env.local (anonymous local by default)
#   ./scripts/setup-auth-env.sh --cloud  -> the cloud dev deployment in .env.cloud.local
#   ./scripts/setup-auth-env.sh --prod   -> the production deployment of that cloud project
# SITE_URL defaults to http://localhost:5173; set SITE_URL=https://... for production.
# Re-running rotates the keys, which signs everyone out of that deployment.
set -euo pipefail
cd "$(dirname "$0")/.."
FLAG="${1:-}"
SITE="${SITE_URL:-http://localhost:5173}"
ENV_FLAG=()
case "$FLAG" in
  --prod|--cloud)
    if [ ! -f .env.cloud.local ]; then
      echo "Missing .env.cloud.local. Run: npx convex dev --once --env-file .env.cloud.local" >&2
      exit 1
    fi
    CONVEX_DEPLOYMENT=$(grep -E '^CONVEX_DEPLOYMENT=' .env.cloud.local | cut -d= -f2 | cut -d' ' -f1)
    export CONVEX_DEPLOYMENT
    [ "$FLAG" = "--prod" ] && ENV_FLAG=(--prod)
    ;;
  "") ;;
  *) echo "Usage: $0 [--cloud|--prod]" >&2; exit 1 ;;
esac
OUT=$(node scripts/gen-auth-keys.mjs)
PK=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).privateKey))')
JW=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).jwks))')
npx convex env set ${ENV_FLAG[@]+"${ENV_FLAG[@]}"} JWT_PRIVATE_KEY -- "$PK"
npx convex env set ${ENV_FLAG[@]+"${ENV_FLAG[@]}"} JWKS -- "$JW"
npx convex env set ${ENV_FLAG[@]+"${ENV_FLAG[@]}"} SITE_URL "$SITE"
echo "Auth env set (${FLAG:-local .env.local deployment}), SITE_URL=$SITE"
