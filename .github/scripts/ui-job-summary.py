#!/usr/bin/env python3
"""Writes the UI automation job summary (Markdown) to stdout; append it to $GITHUB_STEP_SUMMARY.

Reads the Playwright JSON report (REPORT, default test-results/results.json) and reuses the same
parsing as the Slack card (slack-test-card.py), so the summary and the card always agree.
A missing report (cancelled / timed-out run) produces a short note instead of failing.
"""
import importlib.util
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("card", os.path.join(here, "slack-test-card.py"))
card = importlib.util.module_from_spec(spec)
spec.loader.exec_module(card)


def cell(text):
    return str(text).replace("|", "\\|").replace("\n", " ")


def main():
    path = os.environ.get("REPORT", "test-results/results.json")
    report = card.load(path)
    print("### UI automation")
    if not report:
        print("No report was produced - the run was cancelled or timed out before it finished.")
        return
    s = card.ui_summary(report)
    total = s["passed"] + s["failed"] + s["skipped"]
    ran = s["passed"] + s["failed"]
    rate = f"{s['passed'] * 100 / ran:.0f}%" if ran else "-"
    flaky = report.get("stats", {}).get("flaky", 0)
    print(f"{total} tests: **{s['passed']} passed**, {s['failed']} failed, {s['skipped']} skipped"
          f" · pass rate {rate} · {card.duration(s['ms'])}")
    if flaky:
        print(f"\n:warning: {flaky} flaky test(s) passed only after a retry.")

    print("\n#### By spec file\n")
    print("| | Spec | Passed | Failed | Skipped |\n|---|---|---|---|---|")
    for g in sorted(s["groups"], key=lambda g: (g["failed"] == 0, g["name"])):
        icon = ":x:" if g["failed"] else (":white_circle:" if g["skipped"] and not g["passed"] else ":white_check_mark:")
        print(f"| {icon} | {cell(g['name'])} | {g['passed']} | {g['failed']} | {g['skipped']} |")

    if s["failures"]:
        print("\n#### Failed tests\n")
        counts, errors = {}, {}
        for name, err in s["failures"]:
            counts[name] = counts.get(name, 0) + 1
            errors.setdefault(name, err)
        for name, n in counts.items():
            print(f"- **{cell(name)}**" + (f" × {n}" if n > 1 else ""))
            if errors[name]:
                print(f"  - `{card.cut(errors[name].replace('`', chr(39)), 200)}`")

    print("\nFull HTML report, traces and screenshots: download the **ui-e2e-report** artifact below "
          "and run `npx playwright show-report <folder>/playwright-report`.")


if __name__ == "__main__":
    main()
