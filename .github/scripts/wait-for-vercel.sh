#!/usr/bin/env bash
# Waits until the Vercel project has finished deploying the given commit.
#
# Vercel auto-deploys on push and reports each deployment to GitHub (Deployments API). We find
# the deployment for this SHA that belongs to the given Vercel project and wait for "success".
#
# If no deployment for the project shows up (e.g. the GitHub integration labels environments
# differently than expected) we fall back to checking that the site answers over HTTP. That
# fallback cannot prove the NEW build is live, so it prints a warning.
#
# Needs: GH_TOKEN (deployments: read). Optional: VERCEL_BYPASS_SECRET for protected deployments.
#
# Usage: wait-for-vercel.sh <owner/repo> <full-sha> <vercel-project-name> <web-url> [timeout-seconds]
set -euo pipefail

repo="${1:?owner/repo required}"
sha="${2:?commit sha required}"
project="${3:?vercel project name required}"
web_url="${4:?web url required}"
timeout="${5:-900}"
fallback_after=240

start=$(date +%s)
deadline=$(( start + timeout ))

echo "Waiting for Vercel project '${project}' to deploy ${sha:0:7} (timeout ${timeout}s)"
while :; do
  now=$(date +%s)

  # Environment names look like "Preview – <project>" / "Production – <project>".
  id="$(gh api "repos/${repo}/deployments?sha=${sha}&per_page=100" 2>/dev/null \
        | jq -r --arg p "$project" '[.[] | select(.environment | endswith($p))] | sort_by(.created_at) | last | .id // empty' 2>/dev/null || true)"

  if [ -n "$id" ]; then
    state="$(gh api "repos/${repo}/deployments/${id}/statuses" --jq '.[0].state // "pending"')"
    echo "  deployment ${id}: ${state}"
    case "$state" in
      success) echo "Vercel deployment is live"; exit 0 ;;
      failure|error)
        echo "::error::Vercel deployment ${id} for '${project}' ended in state '${state}'"
        exit 1 ;;
    esac
  elif [ $(( now - start )) -ge "$fallback_after" ]; then
    echo "::warning::No GitHub deployment found for '${project}' at ${sha:0:7}; falling back to an HTTP check (cannot prove the new build is live)"
    headers=()
    [ -n "${VERCEL_BYPASS_SECRET:-}" ] && headers=(-H "x-vercel-protection-bypass: ${VERCEL_BYPASS_SECRET}")
    code="$(curl -sS -o /dev/null -m 30 -w '%{http_code}' "${headers[@]}" "${web_url%/}/" || true)"
    echo "  GET ${web_url} -> ${code}"
    if [ "$code" = "200" ]; then exit 0; fi
  else
    echo "  no deployment for '${project}' registered yet"
  fi

  if [ "$now" -ge "$deadline" ]; then
    echo "::error::Timed out waiting for Vercel project '${project}'"
    exit 1
  fi
  sleep 15
done
