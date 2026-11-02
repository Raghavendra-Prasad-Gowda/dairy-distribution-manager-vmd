#!/usr/bin/env python3
"""Builds the Slack card for a Staging Pipeline run and prints it as JSON on stdout.

Reads the Cucumber JSON report (API) and the Playwright JSON report (UI) if they exist and
works out passed / failed / skipped for each, plus the names of what failed. Either report can
be missing (cancelled run, job never reached): the card then says so instead of failing.

Environment:
  API_REPORT, UI_REPORT        paths to the two JSON reports (optional)
  API_RESULT, UI_RESULT, DEPLOY_RESULT   needs.<job>.result values
  RUN_URL, REPO, SHA, ACTOR, COMMIT_SUBJECT   run context
Usage: slack-test-card.py > card.json
"""
import json
import os

MAX_FAILURES = 6  # per suite, so a wall of API failures cannot hide the UI ones
MAX_LINE = 140


def cut(text, n=MAX_LINE):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def load(path):
    if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except ValueError:
        return None


def api_summary(report):
    """Cucumber JSON -> (passed, failed, skipped, [failure lines])."""
    passed = failed = skipped = 0
    failures = []
    for feature in report:
        name = os.path.basename(feature.get("uri", "")).replace(".feature", "")
        background_bad = False
        for el in feature.get("elements", []):
            statuses = [s["result"]["status"] for s in el.get("steps", [])]
            if el.get("type") == "background":
                background_bad = any(s != "passed" for s in statuses)
                continue
            bad = background_bad or any(s in ("failed", "undefined", "pending", "ambiguous") for s in statuses)
            if bad:
                failed += 1
                failures.append(f"{name} › {el.get('name', '')}")
            elif statuses and all(s == "skipped" for s in statuses):
                skipped += 1
            else:
                passed += 1
    return passed, failed, skipped, failures


def ui_summary(report):
    """Playwright JSON -> (passed, failed, skipped, [failure lines])."""
    stats = report.get("stats", {})
    passed = stats.get("expected", 0) + stats.get("flaky", 0)
    failed = stats.get("unexpected", 0)
    skipped = stats.get("skipped", 0)
    failures = []

    def walk(suite, trail):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                if test.get("status") == "unexpected":
                    where = test.get("projectName", "")
                    failures.append(f"{where} › {' › '.join(trail + [spec.get('title', '')])}")
        for child in suite.get("suites", []):
            walk(child, trail + ([child.get("title")] if child.get("title") else []))

    for top in report.get("suites", []):
        walk(top, [])
    return passed, failed, skipped, failures


def failure_lines(label, failures):
    """Bullet lines for one suite: repeats (scenario outline examples) collapse to 'x N'."""
    counts = {}
    for f in failures:
        counts[f] = counts.get(f, 0) + 1
    lines = [f"• {label}: {cut(f)}" + (f" × {n}" if n > 1 else "") for f, n in counts.items()]
    if len(lines) > MAX_FAILURES:
        lines = lines[:MAX_FAILURES] + [f"…and {len(counts) - MAX_FAILURES} more {label} failures"]
    return lines


def line(label, result, summary):
    """One line of the card for a suite."""
    if summary is None:
        why = {"skipped": "not run (an earlier step failed)", "cancelled": "cancelled", "failure": "no report produced"}
        return f"*{label}:* {why.get(result, 'no report')}"
    passed, failed, skipped, _ = summary
    parts = [f"{passed} passed", f"{failed} failed"]
    if skipped:
        parts.append(f"{skipped} skipped")
    return f"*{label}:* " + " · ".join(parts)


def main():
    env = os.environ.get
    api_report, ui_report = load(env("API_REPORT")), load(env("UI_REPORT"))
    api = api_summary(api_report) if api_report else None
    ui = ui_summary(ui_report) if ui_report else None

    results = {"deploy": env("DEPLOY_RESULT", ""), "api": env("API_RESULT", ""), "ui": env("UI_RESULT", "")}
    ok = results["ui"] == "success" and results["api"] == "success"
    if ok:
        title, colour = "✅ Staging verified", "#2eb67d"
    elif "cancelled" in results.values():
        title, colour = "⚪ Staging run cancelled", "#8d8d8d"
    else:
        title, colour = "❌ Staging verification FAILED", "#e01e5a"

    sha = (env("SHA") or "")[:7]
    repo, run_url = env("REPO", ""), env("RUN_URL", "")
    context = f"`{sha}` {cut(env('COMMIT_SUBJECT', ''), 90)}".strip()
    if env("ACTOR"):
        context += f" · by {env('ACTOR')}"

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title.replace("*", "")}},
        {"type": "section", "text": {"type": "mrkdwn", "text": context or repo}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": line("API", results["api"], api)},
            {"type": "mrkdwn", "text": line("UI", results["ui"], ui)},
        ]},
    ]

    shown = (failure_lines("API", api[3]) if api else []) + (failure_lines("UI", ui[3]) if ui else [])
    if shown:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "*Failed*\n" + "\n".join(shown)}})
    if api and api[2]:
        blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text":
            f"{api[2]} API scenario(s) skipped - usually missing E2E superadmin secrets."}]})

    if run_url:
        blocks.append({"type": "actions", "elements": [
            {"type": "button", "text": {"type": "plain_text", "text": "View run"}, "url": run_url}]})

    fallback = f"{title}: {context}"
    print(json.dumps({"text": fallback, "attachments": [{"color": colour, "blocks": blocks}]}))


if __name__ == "__main__":
    main()
