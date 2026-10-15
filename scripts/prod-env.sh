#!/usr/bin/env bash
# Runs `npx convex env ...` against the PRODUCTION deployment of the cloud project
# named in .env.cloud.local, whatever .env.local points at.
# Usage: ./scripts/prod-env.sh list | get NAME | set NAME value | remove NAME
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env.cloud.local ]; then
  echo "Missing .env.cloud.local. Run: npx convex dev --once --env-file .env.cloud.local" >&2
  exit 1
fi
CONVEX_DEPLOYMENT=$(grep -E '^CONVEX_DEPLOYMENT=' .env.cloud.local | cut -d= -f2 | cut -d' ' -f1)
export CONVEX_DEPLOYMENT
exec npx convex env "$@" --prod
