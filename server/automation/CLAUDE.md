# API Automation — Engineering Contract

Black-box **API** tests for Vikas Milk Dairy: **Java 21 + Maven + Cucumber (Gherkin) + REST Assured**, run
against a **deployed** backend and its **real database**. Nothing is mocked.

This folder lives inside `server/` because it tests the server, but it is a **separate Maven project**. The
Node app never imports it, and it is excluded from server ESLint, Prettier and c8 coverage
(`server/eslint.config.js`, `server/.prettierignore`) — keep those exclusions. How to run it and the full
feature list: `README.md`. Mocked-spec ↔ scenario map: `COVERAGE.md`. Repo-wide rules: root `CLAUDE.md`.
The companion UI suite is `client/automation-ui/` (`client/automation-ui/CLAUDE.md`).


Detailed documentation: `docs/` (architecture, writing scenarios, tags, configuration & CI, troubleshooting).

## Relationship to `server/tests`

| | `server/tests/playwright` | `server/automation` (this) |
|---|---|---|
| Proves | code logic with a mocked Prisma | the deployed backend + real DB |
| Runs | every PR | after merge to `develop` (gate); `@smoke` after merge to `main` |
| Owns | unit logic, rate-limit exhaustion, lock-out / full MFA, Slack card shape, forged-token internals, finalisation | **endpoint behaviour** — status codes, validation, role matrix, ledger cascades, reports |

New endpoint behaviour gets a scenario **here**; the root `CLAUDE.md` §12 minimum (no token, bad token, bad
input, wrong role, happy path, business rule) applies. When a mocked spec file is added, removed or its tests
are moved here, update `COVERAGE.md` in the same PR.

## Layout

```
server/automation/
├── pom.xml                                   # Java 21, Cucumber 7, REST Assured 5, JUnit Platform
└── src/test/
    ├── resources/
    │   ├── junit-platform.properties         # reports → target/cucumber-reports/report.{html,json}
    │   └── features/api/*.feature            # scenarios, business language only
    └── java/com/vmd/automation/
        ├── RunCucumberTest.java              # the single suite; select scenarios with tags
        ├── TestContext.java                  # per-scenario state (last response, aliases, cleanup)
        ├── config/TestConfig.java            # every setting, from environment variables
        ├── core/                             # framework — knows nothing about VMD endpoints
        │   ├── ApiClient                     # the one place a request is built
        │   ├── AuthManager / Role            # one cached sign-in per role per run
        │   ├── RateLimitRetryFilter          # waits out short 429s; never retries a write on 5xx
        │   ├── ExchangeLog                   # masked request/response evidence on failure
        │   ├── Cleanup / SalespersonCleanup  # undo-actions, newest first, all attempted
        │   ├── Placeholders / Dates          # ${alias.field}, ${unique}, ${today+7} (IST)
        │   ├── SalespersonPool               # clean salespeople lent to scenarios
        │   └── JwtForge                      # tokens the server must reject
        ├── fixtures/Fixtures.java            # throwaway brand/category/product/route/salesperson/admin
        ├── hooks/Hooks.java                  # evidence, per-scenario cleanup, run-scoped removal
        ├── steps/                            # CommonSteps, FixtureSteps, DairySteps, DispatchSteps,
        │                                     # LedgerSteps, PricingSteps, SalespersonLedgerSteps
        └── api/                              # health + route steps (original)
```

## Where it runs

| Workflow | Job | Tags | Notes |
|---|---|---|---|
| `pr-checks.yml` | `compile-automation-suite` | — | `mvn -B -ntp test-compile` only (needs a deployed env to run) |
| `staging-pipeline.yml` | `api-automation` | `@api and not @known-defect and not @shared-state` | after `wait-for-testing-deploy`; gates `Staging Verified` |
| `production-verify.yml` | `wait-for-deploy-and-smoke-test` | `@api and @smoke` | **read-only** against production |

CI uses `working-directory: server/automation`, `cache-dependency-path: server/automation/pom.xml` and uploads
`server/automation/target/cucumber-reports` (`api-e2e-report` / `prod-smoke-report`). The JSON report feeds the job
summary and the Slack results card — do not move it without updating the workflows and `.github/scripts/`.

**Deploy coupling:** Render deploys from `server/`, so a change here triggers a backend redeploy, and
`.github/scripts/wait-for-backend.sh` waits for it before this suite runs. `EXPECTED_COMMIT` is the commit
that script saw running; the health scenario asserts `/health` reports it.

## Rules

1. **Business language in features, mechanics in code.** Step text says what a user does or expects; HTTP,
   JSON paths and cleanup live in `steps/`, `core/`, `fixtures/`.
2. **No ids, tokens or dates in feature files.** Remember entities under an alias (`${brand.id}`) and write
   dates as `${today-2}` (India time — the zone the backend validates in).
3. **Everything a scenario creates is `E2E-...` named and removed afterwards**, pass or fail, through the
   undo-actions its fixtures register. Brands and products cannot be deleted, so they are archived/deactivated.
4. **Ledger scenarios use a throwaway brand**, never Nandini, Jersey or Gowardhan.
5. **Assert on what the scenario created** (`data.find { it.id == ${product.id} }`) — shared lists contain
   other people's data; never assert on "the first item" or a total count.
6. **Never sign in per scenario.** Use a role (`admin calls ...`); `AuthManager` caches one session per role.
   Sign-in is limited to 20/hour/IP and a full run uses about 15.
7. **Respect rate limits.** `/salespeople` and `/stock-receipts` allow 30 requests/minute: borrow a salesperson
   from `SalespersonPool` (`a salesperson with a clean ledger "sp"`) unless the scenario is about creating,
   editing or deleting salespeople (`a throwaway salesperson "sp"`). Never exhaust a limit on purpose.
8. **`@smoke` only on read-only scenarios.** It runs against production.
9. **`@shared-state`** for anything that changes state every user shares (finalising a day). Such scenarios
   must skip themselves when the state is not as needed and undo their change.
10. **`@known-defect`** for correct behaviour the API does not have yet. When the server is fixed, remove the
    tag (and the entry in `README.md` → Known defects) so it joins the gate.
11. **`@superadmin`** when the scenario needs a superadmin session; it skips without `E2E_SUPERADMIN_*`, or
    fails when `E2E_STRICT=true`.
12. Every scenario also carries `@api` and one area tag (`@brands @products @dispatch @ledger @reports @bills
    @auth @pin @access @security ...`).
13. Read config only through `TestConfig`; never hard-code a URL or credential.
14. Accounts used by the suite must **not have MFA**, and the suite must never trip account lock-out.
15. **Every path and branch of every change is covered** (root `CLAUDE.md` §17.1a). For each endpoint you add or
    touch, write a scenario per role (allowed and refused), per validation rule (and the boundary value), per
    `if`/`else`/`throw`/default in the controller or service, per data state (not found, duplicate, in use, empty,
    locked) and per ledger/side-effect outcome. Use `Scenario Outline` + `Examples` for role and validation
    matrices. Put the `branch → scenario` list in the PR; list unreachable branches in `COVERAGE.md`.

## Adding a scenario

- **First enumerate the branches** of the code you changed (rule 15), then write the scenarios — happy path last.

- Put it in the feature file for its area (see `README.md` → What it covers); create a new feature only for a
  new area, then add it to the README table and `COVERAGE.md`.
- Reuse existing steps (`CommonSteps` covers calls + assertions) before writing new ones; new step code goes in
  the matching `steps/*Steps.java`, framework code in `core/`.
- `mvn -B -ntp test-compile` must pass before pushing. Run the area locally with
  `mvn test -Dcucumber.filter.tags="@<area>"` against a local or testing backend.
- When the server changes a route, status code or response field, update the scenarios **in the same PR** —
  this suite only runs after merge and a break turns `Staging Verified` red.

## Environment variables

| Variable | Notes |
|---|---|
| `API_BASE_URL` | backend origin, no `/api/v1` (default `http://localhost:3001`) |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | admin account, **no MFA** (required for anything authenticated) |
| `E2E_SUPERADMIN_USERNAME` / `E2E_SUPERADMIN_PASSWORD` | superadmin, **no MFA**; optional (falls back to the admin account if it is a superadmin) |
| `E2E_STRICT` | `true` = a missing prerequisite fails instead of skipping |
| `EXPECTED_COMMIT` | commit `/health` must report |
| `HTTP_CONNECT_TIMEOUT_MS` / `HTTP_READ_TIMEOUT_MS` | defaults 30 s / 90 s (sleeping Render service) |

## What NOT to Do
- Do not write to production — no scenario without `@smoke` may ever be pointed at it.
- Do not reference server source files or import Node code; test the HTTP surface only.
- Do not add per-scenario sign-ins, sleeps or retries around writes.
- Do not commit `target/` (ignored as `server/automation/target/`).
- Do not use real brands or real salespeople as test data.
