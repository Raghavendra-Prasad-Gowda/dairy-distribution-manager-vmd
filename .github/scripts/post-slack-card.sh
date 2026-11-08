#!/usr/bin/env bash
# Builds the Slack card for one suite ($SUITE = api|ui) and posts it to $SLACK_WEBHOOK_URL.
# A failed post must not turn a verified build red; it only warns.
set -uo pipefail
card="$RUNNER_TEMP/slack-card-$SUITE.json"
# Version the deployed backend reports (same release number as production), shown on the card.
# Best-effort: a slow or unreachable /health just leaves the field out.
if [ -n "${API_URL:-}" ]; then
  health="$(curl -sS -m 60 "${API_URL%/}/health" 2>/dev/null || true)"
  APP_VERSION_LABEL="$(printf '%s' "$health" | jq -r '[(if .version then "v" + .version else empty end), .commit] | map(select(. != null and . != "")) | join(" · ")' 2>/dev/null || true)"
  export APP_VERSION_LABEL
fi
python3 .github/scripts/slack-test-card.py "$SUITE" > "$card"
code=$(curl -sS -o "$RUNNER_TEMP/slack-response-$SUITE.txt" -w '%{http_code}' -X POST \
  -H 'Content-type: application/json' --data @"$card" "$SLACK_WEBHOOK_URL" || true)
if [ "$code" != "200" ]; then
  echo "::warning::Slack post ($SUITE) returned HTTP $code: $(cat "$RUNNER_TEMP/slack-response-$SUITE.txt")"
fi
