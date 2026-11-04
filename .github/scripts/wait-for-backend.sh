#!/usr/bin/env bash
# Waits until the Render backend is serving the given commit.
#
# Render auto-deploys on push (we don't trigger it), so after a merge the old build keeps
# answering until the new one is live. /health reports the first 7 chars of the running commit
# (RENDER_GIT_COMMIT), so we poll until it matches the SHA we are about to test.
#
# Render only deploys when files under its root directory (server/) change. A merge that touches
# only .github/, docs/, client/, ... never produces a new backend build, so /health keeps
# reporting the older commit forever. To avoid hanging until the timeout, we also accept a
# running commit whose server/ code is identical to the SHA under test (checked with the GitHub
# compare API; needs GH_TOKEN + GITHUB_REPOSITORY, otherwise only an exact match passes).
#
# On success the commit the backend is actually running is written to $GITHUB_OUTPUT as
# `commit=<sha7>`, so later steps/jobs can assert against what is deployed (it differs from the
# pushed SHA when Render skipped the deploy).
#
# Usage: wait-for-backend.sh <api-base-url> <full-sha> [timeout-seconds]
# Env:   BACKEND_PATH  repo directory Render deploys from (default: server)
#        POLL_SECONDS  seconds between polls (default: 15)
set -euo pipefail

url="${1:?api base url required}"
sha="${2:?commit sha required}"
timeout="${3:-1200}"

url="${url%/}"
want="${sha:0:7}"
deadline=$(( $(date +%s) + timeout ))
got=""
backend_path="${BACKEND_PATH:-server}"
poll="${POLL_SECONDS:-15}"
checked=""

report_commit() {
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "commit=$1" >> "$GITHUB_OUTPUT"
  return 0
}

# Succeeds when nothing under $backend_path differs between commit $1 (what is running) and $sha.
# Fails (=> keep waiting) on any doubt: unknown commit, API error, or a truncated file list.
backend_code_unchanged_since() {
  [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] || return 1
  local out total changed
  out="$(gh api "repos/${GITHUB_REPOSITORY}/compare/${1}...${sha}" 2>/dev/null \
        | jq -r --arg p "${backend_path}/" '[(.files // [] | length), ([(.files // [])[].filename | select(startswith($p))] | length)] | @tsv' 2>/dev/null)" || return 1
  [ -n "$out" ] || return 1
  total="${out%%$'\t'*}"
  changed="${out##*$'\t'}"
  # The compare API lists at most 300 files; a full page may hide changes under $backend_path.
  [ "$total" -lt 300 ] && [ "$changed" -eq 0 ]
}

echo "Waiting for ${url}/health to report commit ${want} (timeout ${timeout}s)"
while :; do
  # -m 90: a sleeping free-plan Render service can take ~1 min to answer the first request.
  body="$(curl -sS -m 90 "${url}/health" 2>/dev/null || true)"
  got="$(printf '%s' "$body" | jq -r '.commit // empty' 2>/dev/null || true)"

  if [ "$got" = "$want" ]; then
    echo "Backend is live on ${want}"
    report_commit "$got"
    exit 0
  fi

  # Running an older build is fine if it has the same backend code (Render skips deploys for
  # commits that do not touch $backend_path). Ask GitHub once per distinct running commit.
  if [ -n "$got" ] && [ "$got" != "$checked" ]; then
    checked="$got"
    if backend_code_unchanged_since "$got"; then
      echo "Backend runs ${got}; nothing under ${backend_path}/ changed between ${got} and ${want}, so Render has no new build to deploy. Treating it as live."
      report_commit "$got"
      exit 0
    fi
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Timed out waiting for backend commit ${want} (last seen: '${got:-no response}')"
    exit 1
  fi

  echo "  backend commit: '${got:-no response}' - not ${want} yet, retrying in ${poll}s"
  sleep "$poll"
done
