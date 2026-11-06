#!/usr/bin/env python3
"""Builds ONE Slack card for a staging-pipeline suite and prints it as JSON on stdout.

The pipeline posts two separate cards, one per suite:
  slack-test-card.py api > api-card.json     (Cucumber JSON report)
  slack-test-card.py ui  > ui-card.json      (Playwright JSON report)

Each card shows the overall result, totals, pass rate and duration, a per-feature (API) or
per-spec-file (UI) breakdown, and the failed scenarios/tests with the first line of the error.
A missing report (cancelled run, job never reached) produces a card that says so instead of failing.

Environment:
  REPORT                              path to this suite's JSON report (optional)
  RESULT                              needs.<job>.result of this suite's job
  TARGET_URL                          the environment the suite ran against
  RUN_URL, REPO, SHA, ACTOR, COMMIT_SUBJECT   run context
  DASHBOARD_URL                       pipeline dashboard (optional); adds a button to the card
"""
import json
import os
import sys

MAX_FAILURES = 8     # failed items listed on a card
MAX_BREAKDOWN = 15   # rows in the per-feature / per-spec breakdown
MAX_LINE = 140
SLACK_TEXT_LIMIT = 2900  # a section's text is capped at 3000 characters


def cut(text, n=MAX_LINE):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def duration(ms):
    secs = int(round(ms / 1000))
    mins, secs = divmod(secs, 60)
    return f"{mins}m {secs:02d}s" if mins else f"{secs}s"


def load(path):
    if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except ValueError:
        return None


def first_line(message):
    for ln in str(message or "").splitlines():
        ln = ln.strip()
        if ln:
            return ln
    return ""


def api_summary(report):
    """Cucumber JSON -> summary dict."""
    totals = {"passed": 0, "failed": 0, "skipped": 0}
    groups, failures, total_ms = [], [], 0
    for feature in report:
        name = feature.get("name") or os.path.basename(feature.get("uri", "")).replace(".feature", "")
        g = {"name": name, "passed": 0, "failed": 0, "skipped": 0}
        background_bad = False
        for el in feature.get("elements", []):
            steps = el.get("steps", [])
            results = [s.get("result", {}) for s in steps]
            statuses = [r.get("status") for r in results]
            total_ms += sum(r.get("duration", 0) for r in results) / 1e6  # nanoseconds
            if el.get("type") == "background":
                background_bad = any(s != "passed" for s in statuses)
                continue
            bad = background_bad or any(s in ("failed", "undefined", "pending", "ambiguous") for s in statuses)
            if bad:
                kind = "failed"
                err = next((r.get("error_message") for r in results if r.get("error_message")), "")
                failures.append((f"{name} › {el.get('name', '')}", first_line(err)))
            elif statuses and all(s == "skipped" for s in statuses):
                kind = "skipped"
            else:
                kind = "passed"
            g[kind] += 1
            totals[kind] += 1
        groups.append(g)
    return {**totals, "groups": groups, "failures": failures, "ms": total_ms, "unit": "scenarios"}


def ui_summary(report):
    """Playwright JSON -> summary dict."""
    stats = report.get("stats", {})
    totals = {
        "passed": stats.get("expected", 0) + stats.get("flaky", 0),
        "failed": stats.get("unexpected", 0),
        "skipped": stats.get("skipped", 0),
    }
    groups, failures = [], []

    def walk(suite, trail, g):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                status = test.get("status")
                kind = {"expected": "passed", "flaky": "passed", "unexpected": "failed"}.get(status, "skipped")
                g[kind] += 1
                if status == "unexpected":
                    where = test.get("projectName", "")
                    title = " › ".join(trail + [spec.get("title", "")])
                    err = ""
                    for res in test.get("results", []):
                        err = (res.get("error") or {}).get("message") or err
                    failures.append((f"{where} › {title}" if where else title, first_line(err)))
        for child in suite.get("suites", []):
            walk(child, trail + ([child.get("title")] if child.get("title") else []), g)

    for top in report.get("suites", []):
        g = {"name": top.get("title") or top.get("file", ""), "passed": 0, "failed": 0, "skipped": 0}
        walk(top, [], g)
        groups.append(g)
    return {**totals, "groups": groups, "failures": failures, "ms": stats.get("duration", 0), "unit": "tests"}


def breakdown(groups):
    """One line per feature / spec file: icon, name, counts. Failing ones first."""
    rows = sorted(groups, key=lambda g: (g["failed"] == 0, g["name"]))
    lines = []
    for g in rows[:MAX_BREAKDOWN]:
        icon = "❌" if g["failed"] else ("⚪" if g["skipped"] and not g["passed"] else "✅")
        extra = (f" · {g['failed']} failed" if g["failed"] else "") + (f" · {g['skipped']} skipped" if g["skipped"] else "")
        lines.append(f"{icon} {cut(g['name'], 60)} — {g['passed']} passed{extra}")
    if len(rows) > MAX_BREAKDOWN:
        lines.append(f"…and {len(rows) - MAX_BREAKDOWN} more")
    return "\n".join(lines)


def failure_text(failures):
    """Failed items with the first line of the error; repeats (scenario outline rows) collapse to ×N."""
    counts, errors = {}, {}
    for name, err in failures:
        counts[name] = counts.get(name, 0) + 1
        errors.setdefault(name, err)
    lines = []
    for name, n in list(counts.items())[:MAX_FAILURES]:
        lines.append(f"• *{cut(name)}*" + (f" × {n}" if n > 1 else ""))
        if errors[name]:
            lines.append(f"    `{cut(errors[name].replace('`', "'"), 120)}`")
    if len(counts) > MAX_FAILURES:
        lines.append(f"…and {len(counts) - MAX_FAILURES} more failures")
    text = "\n".join(lines)
    return text if len(text) <= SLACK_TEXT_LIMIT else text[: SLACK_TEXT_LIMIT - 1] + "…"


def main():
    suite = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
    if suite not in ("api", "ui"):
        sys.exit("usage: slack-test-card.py api|ui")
    label = "API automation" if suite == "api" else "UI automation"
    tool = "REST Assured + Cucumber" if suite == "api" else "Playwright + TypeScript"

    env = os.environ.get
    report = load(env("REPORT"))
    summary = (api_summary if suite == "api" else ui_summary)(report) if report else None
    result = env("RESULT", "")

    if result == "success" and summary and not summary["failed"]:
        title, colour = f"✅ {label} passed", "#2eb67d"
    elif result == "cancelled":
        title, colour = f"⚪ {label} cancelled", "#8d8d8d"
    elif result == "skipped":
        title, colour = f"⚪ {label} not run", "#8d8d8d"
    else:
        title, colour = f"❌ {label} FAILED", "#e01e5a"

    sha, repo, run_url = (env("SHA") or "")[:7], env("REPO", ""), env("RUN_URL", "")
    context = f"`{sha}` {cut(env('COMMIT_SUBJECT', ''), 90)}".strip()
    if env("ACTOR"):
        context += f" · by {env('ACTOR')}"

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title}},
        {"type": "section", "text": {"type": "mrkdwn", "text": context or repo}},
    ]

    if summary is None:
        why = {"skipped": "not run (an earlier step failed)", "cancelled": "cancelled before it finished"}
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text":
            f"*Result:* {why.get(result, 'no report was produced')}"}})
    else:
        total = summary["passed"] + summary["failed"] + summary["skipped"]
        ran = summary["passed"] + summary["failed"]
        rate = f"{summary['passed'] * 100 / ran:.0f}%" if ran else "–"
        fields = [
            f"*Tool:*\n{tool}",
            f"*Environment:*\n{env('TARGET_URL') or '–'}",
            f"*Total {summary['unit']}:*\n{total}",
            f"*Pass rate:*\n{rate}",
            f"*Passed:*\n{summary['passed']}",
            f"*Failed:*\n{summary['failed']}",
            f"*Skipped:*\n{summary['skipped']}",
            f"*Duration:*\n{duration(summary['ms'])}",
        ]
        blocks.append({"type": "section", "fields": [{"type": "mrkdwn", "text": f} for f in fields]})

        rows = breakdown(summary["groups"])
        if rows:
            heading = "By feature" if suite == "api" else "By spec file"
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*{heading}*\n{rows}"[:SLACK_TEXT_LIMIT]}})
        if summary["failures"]:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "*Failed*\n" + failure_text(summary["failures"])}})
        if suite == "api" and summary["skipped"]:
            blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text":
                f"{summary['skipped']} scenario(s) skipped - usually missing E2E superadmin secrets."}]})

    buttons = []
    if run_url:
        buttons.append({"type": "button", "text": {"type": "plain_text", "text": "View run & report"}, "url": run_url})
    dashboard_url = env("DASHBOARD_URL", "")
    if dashboard_url.startswith("https://"):
        buttons.append({"type": "button", "text": {"type": "plain_text", "text": "📊 Dashboard"}, "url": dashboard_url})
    if buttons:
        blocks.append({"type": "actions", "elements": buttons})

    print(json.dumps({"text": f"{title}: {context}", "attachments": [{"color": colour, "blocks": blocks}]}))


if __name__ == "__main__":
    main()
