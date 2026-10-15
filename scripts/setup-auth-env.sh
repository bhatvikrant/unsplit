#!/usr/bin/env bash
# Sets JWT_PRIVATE_KEY, JWKS and SITE_URL on the current Convex deployment.
# Pass --prod to target the production deployment. SITE_URL defaults to http://localhost:5173.
set -euo pipefail
cd "$(dirname "$0")/.."
FLAG="${1:-}"
SITE="${SITE_URL:-http://localhost:5173}"
OUT=$(node scripts/gen-auth-keys.mjs)
PK=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).privateKey))')
JW=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).jwks))')
npx convex env set $FLAG JWT_PRIVATE_KEY -- "$PK"
npx convex env set $FLAG JWKS -- "$JW"
npx convex env set $FLAG SITE_URL "$SITE"
echo "Auth env set on deployment ($FLAG)."
