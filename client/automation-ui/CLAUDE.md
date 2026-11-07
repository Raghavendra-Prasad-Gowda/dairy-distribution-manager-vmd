# UI Automation — Engineering Contract

Black-box browser tests for Vikas Milk Dairy: **Playwright Test + TypeScript**, run against a **deployed**
environment. Real browser → real frontend (Vercel) → real API (Render) → real database. Nothing is mocked.

This folder lives inside `client/` because it tests the client, but it is a **separate project** with its own
`package.json`, `tsconfig.json` and lockfile. It is not imported by, built with, linted with or tested with the
React app (`client/vite.config.js` Vitest `exclude`, `client/eslint.config.js` ignore and `client/.vercelignore`
keep it out — keep those exclusions). How to run it: `README.md`. Repo-wide rules: root `CLAUDE.md`.
The companion API suite is `server/automation/` (`server/automation/CLAUDE.md`).


Detailed documentation: `docs/` (architecture, writing tests, configuration & CI, troubleshooting, roadmap).

## Layout

```
client/automation-ui/
├── playwright.config.ts   # projects + devices; ADMIN_STATE = .auth/admin.json; landscape runs only @layout specs
├── src/
│   ├── env.ts             # every setting, from environment variables (nothing secret hard-coded)
│   ├── seed.ts            # Seed: arrange-by-API (brand, category, product, route, salesperson, dispatch, ...) + dispose()
│   ├── fixtures.ts        # extended `test`: seed, superSeed, editPin, plPin, trackCreated
│   └── pages/             # page objects (BasePage parent) — every selector lives here
└── tests/                 # login · navigation · dairy-ledger · salesperson-ledger · catalog-setup · salesman-users ·
    │                      # pricing-and-bills · reports · access-roles · superadmin · opening-balances ·
    │                      # dispatcher · exception-manager · deposit-and-stock-balance  (+ auth.setup.ts). Flow-by-flow map: docs/coverage-map.md
    └── salesman/          # phone specs: stock-entry · security · statement
```

## Where it runs

| Where | What | Command |
|---|---|---|
| `pr-checks.yml` → `compile-automation-suite` | type-check only | `npm ci && npm run typecheck` |
| `staging-pipeline.yml` → `ui-automation` | full suite vs testing env, after the API suite passes | `npx playwright install --with-deps chromium && npm test` |
| production | **never** — there is no read-only production UI account | — |

CI sets `working-directory: client/automation-ui` and uploads `playwright-report/` + `test-results/` as the
`ui-e2e-report` artifact; `test-results/results.json` feeds the Slack results card and the job summary
(`.github/scripts/ui-job-summary.py`, `slack-test-card.py`). Do not rename those output paths without updating
the workflow and scripts.

## Projects & screens (`playwright.config.ts`)

| Project | Matches | Device |
|---|---|---|
| `setup` | `auth.setup.ts` | iPad portrait |
| `signed-out-ipad-portrait` / `-landscape` | `login.spec.ts` | iPad (gen 7) 810×1080 / 1080×810, Chromium |
| `signed-in-ipad-portrait` / `-landscape` | every other `*.spec.ts` outside `tests/salesman/` | same, with `storageState: .auth/admin.json` |
| `salesman-phone` | `tests/salesman/**/*.spec.ts` | Pixel 7 412×839, starts signed out |

- Superadmin/admin/dispatcher specs run on both iPad orientations; portrait is below the app's `lg` (1024px)
  breakpoint, so it uses the hamburger menu, landscape the sidebar. A page object must handle both.
- `workers: 1`, `fullyParallel: false`, 1 retry on CI — the target is a shared, slow-to-wake environment.
- Timeouts come from `UI_TIMEOUT_MS` (default 60 s); test timeout is twice that.

## Rules

1. **Selectors live in `src/pages/`, behaviour in `tests/`.** Specs never contain a locator string.
   Prefer `getByRole` / `getByLabel` / visible text over CSS or test ids.
2. **Import `test` and `expect` from `src/fixtures`**, not straight from `@playwright/test`, so cleanup
   fixtures are available. Page objects extend `BasePage` (notice + dialog helpers).
3. **Everything a test creates is named `E2E-<unique>` and removed afterwards, pass or fail.** Data a journey merely
   *needs* is arranged through the API with `seed` / `superSeed` (cleanup is registered by the helper itself); data the
   UI creates is registered with `trackCreated(url, id)`. Cleanup must tolerate 404 and wait out 429.
4. **Assert persistence, not just React state** — reload and re-check after a save.
5. **Never sign in per test.** Login is limited to 20 attempts/hour/IP and the API suite uses the same budget.
   Signed-in specs reuse `.auth/admin.json`; salesman specs sign in once as their own salesman.
   A wrong-password test must use an **unknown username** — failed attempts against a real account count toward
   its lock-out (5 wrong passwords lock an admin for 30 min).
6. **The accounts must not have MFA** (`E2E_ADMIN_*`).
7. **Never run write tests against production.**
8. Saves and errors appear in a blocking "Success"/"Error" modal — dismiss it with `acknowledgeNotice(...)`
   before the next interaction.
9. Read config only through `src/env.ts`; credentials are read lazily so signed-out specs need none.
10. Keep `@playwright/test` pinned to an exact version; `npm run typecheck` must pass before pushing.
11. **Arrange by API, act and assert in the browser.** Do not click through setup screens to prepare data; do not use
    the API to *assert* what the UI shows when the UI journey is the point.
12. **Money specs use a throwaway brand** (`superSeed.brand()`), never Nandini/Jersey/Gowardhan — its cleanup zeroes the
    day's stock, deletes its payments and archives it so shared reports stay clean. Catalogue specs that only create
    categories/routes/products use Nandini with `E2E-` names and need no superadmin.
13. **Expected numbers are computed from what you seeded**, never read back from the screen under test.
14. **No fixed sleeps.** Use web-first `expect`, `waitForResponse` set up *before* the click, and `expect.poll`.
15. **Respect the rate limits**: 30 requests/minute on `/salespeople`, `/stock-receipts` and the bulk price/product
    routes; 20 sign-ins/hour. Keep journeys few and complete, reuse tokens (`seed` caches them), run layout-independent
    specs once (portrait) and tag only layout-sensitive describes `@layout` so landscape repeats them.
16. **Every new user-facing flow gets a journey here in the same PR** — happy path plus the refusal that matters
    (wrong PIN, duplicate, locked, wrong role). Specs that need `API_BASE_URL`, a superadmin or a PIN skip when it is
    missing, and fail when `E2E_STRICT=true`.

## Adding a spec

- Pick the folder by user: `tests/salesman/` for salesman screens (phone), `tests/` for everyone else (iPad).
- Add or extend a page object in `src/pages/` first (extend `BasePage`); reuse `ShellPage` for navigation.
- When the app changes visible text, labels, roles or routes that a page object relies on, update the page
  object **in the same PR** — this suite runs only after merge and a break turns `Staging Verified` red.
- Run locally against a dev server or the testing URL before pushing (see `README.md`).

## Environment variables

| Variable | Notes |
|---|---|
| `WEB_BASE_URL` | frontend origin, no trailing slash (default `http://localhost:5173`) |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | admin account **without MFA** |
| `API_BASE_URL` | backend origin, no `/api/v1` — needed by every data-driven spec (arrange + cleanup) |
| `E2E_SUPERADMIN_USERNAME` / `E2E_SUPERADMIN_PASSWORD` | superadmin **without MFA** — throwaway brands, dispatcher logins, Admin Users journey |
| `E2E_EDIT_PIN` / `E2E_PL_PIN` | the edit PIN (delete a payment) and the Profit & Loss PIN |
| `E2E_STRICT` | `true` = fail instead of skip when a prerequisite above is missing |
| `VERCEL_BYPASS_SECRET` | Vercel "Protection Bypass for Automation" secret, only if the frontend is protected |
| `HEADLESS` | `false` to watch the browser |
| `UI_TIMEOUT_MS` | default `60000` (Render's free plan wakes slowly) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | use an installed Chromium instead of the downloaded one |
| `CI` | set by CI: enables `forbidOnly` and one retry |

## What NOT to Do
- Do not import from `client/src` — test the deployed app as a user would.
- Do not add a desktop project; users are on iPads and phones.
- Do not commit `.auth/`, `test-results/` or `playwright-report/` (ignored in `.gitignore`).
- Do not hard-code URLs, usernames or passwords.
- Do not leave `test.only` in a spec (`forbidOnly` fails CI).
