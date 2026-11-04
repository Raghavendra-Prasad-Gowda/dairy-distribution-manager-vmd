#!/usr/bin/env bash
# Builds the Slack card for one suite ($SUITE = api|ui) and posts it to $SLACK_WEBHOOK_URL.
# A failed post must not turn a verified build red; it only warns.
set -uo pipefail
card="$RUNNER_TEMP/slack-card-$SUITE.json"
python3 .github/scripts/slack-test-card.py "$SUITE" > "$card"
code=$(curl -sS -o "$RUNNER_TEMP/slack-response-$SUITE.txt" -w '%{http_code}' -X POST \
  -H 'Content-type: application/json' --data @"$card" "$SLACK_WEBHOOK_URL" || true)
if [ "$code" != "200" ]; then
  echo "::warning::Slack post ($SUITE) returned HTTP $code: $(cat "$RUNNER_TEMP/slack-response-$SUITE.txt")"
fi
