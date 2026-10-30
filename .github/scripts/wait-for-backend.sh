#!/usr/bin/env bash
# Waits until the Render backend is serving the given commit.
#
# Render auto-deploys on push (we don't trigger it), so after a merge the old build keeps
# answering until the new one is live. /health reports the first 7 chars of the running commit
# (RENDER_GIT_COMMIT), so we poll until it matches the SHA we are about to test.
#
# Usage: wait-for-backend.sh <api-base-url> <full-sha> [timeout-seconds]
set -euo pipefail

url="${1:?api base url required}"
sha="${2:?commit sha required}"
timeout="${3:-1200}"

url="${url%/}"
want="${sha:0:7}"
deadline=$(( $(date +%s) + timeout ))
got=""

echo "Waiting for ${url}/health to report commit ${want} (timeout ${timeout}s)"
while :; do
  # -m 90: a sleeping free-plan Render service can take ~1 min to answer the first request.
  body="$(curl -sS -m 90 "${url}/health" 2>/dev/null || true)"
  got="$(printf '%s' "$body" | jq -r '.commit // empty' 2>/dev/null || true)"

  if [ "$got" = "$want" ]; then
    echo "Backend is live on ${want}"
    exit 0
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Timed out waiting for backend commit ${want} (last seen: '${got:-no response}')"
    exit 1
  fi

  echo "  backend commit: '${got:-no response}' - not ${want} yet, retrying in 15s"
  sleep 15
done
