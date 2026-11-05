## What & why

<!-- What does this change, and why? Link the issue: Closes #123 -->

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / chore
- [ ] Docs / CI only

## Checklist (see CLAUDE.md §17)

- [ ] **Tests** — right layer (mocked spec / API scenario / UI spec / Vitest); run locally
- [ ] **Slack** — every new write action fires `void notifySlack(...)`
- [ ] **Product order** — product lists use the `productLayout` helpers
- [ ] **Loaders** — `BrandedLoader` / `TumblerSpinner`, never `Loader2`
- [ ] **Dates** — IST helpers, no bare `new Date()` for business dates
- [ ] **Access** — route guard **and** `assertRole` in the controller
- [ ] **Schema** — new migration (old ones untouched)
- [ ] **Contract** — `docs/openapi.yaml` updated for API changes
- [ ] **Docs** — affected README / docs updated
- [ ] **Automation** — page objects / scenarios updated for renamed routes, fields or text

## Notes for the reviewer

<!-- Screenshots for UI changes, risky areas, follow-ups. Add the `no-auto-merge` label to hold the merge. -->
