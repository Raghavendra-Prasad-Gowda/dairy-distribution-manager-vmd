# VMD API automation

Black-box **API** tests against a **deployed** environment: Cucumber (Gherkin) + REST Assured, Java 21,
Maven. The browser (UI) tests live in [`../automation-ui`](../automation-ui/README.md) (Playwright +
TypeScript). This suite is separate from `server/tests` (the mocked-Prisma specs that run on every PR):
those prove the code in isolation, this one proves the **deployed backend with its real database**.

It runs in `staging-pipeline.yml` after every merge to `develop` (all of it) and in
`production-verify.yml` after a merge to `main` (only the read-only `@smoke` scenarios).

## What it covers

| Feature file | Area |
|---|---|
| `access-control.feature` | who may call what: no token, malformed token, salesman, dispatcher, admin, superadmin |
| `security.feature` | forged / unsigned / not-yet-valid tokens, browser security headers, no internals in errors |
| `authentication.feature` | sign-in, wrong password, deactivated account, change password, cookie flags, two-step endpoints |
| `admin-users.feature` | create / edit / delete admin, dispatcher and superadmin accounts, self-protection rules |
| `brands.feature`, `categories.feature`, `products.feature`, `routes.feature`, `route-management.feature` | dairy setup |
| `salespeople.feature`, `salesperson-pricing.feature` | salespeople, per-salesman prices, product exceptions, global access |
| `dairy-ledger.feature` | stock receipts, dairy payments, top-ups, deposits and the cascading dairy balance |
| `dispatches.feature` | stock entries, server-side pricing, locking, past days, scoping |
| `salesperson-ledger.feature` | collections, dues, ledger reset and the cascading salesperson balance |
| `salesman-self-service.feature` | a salesman's own statement |
| `reports.feature`, `bills.feature` | statements, summaries, dispatch sheet, profit and loss, bills |
| `pin.feature`, `client-errors.feature`, `health.feature` | PIN gates, crash-report beacon, liveness / readiness |
| `known-defects.feature` | correct behaviour the API does **not** have yet (see below) |

### Deliberately not here (they stay in `server/tests`, or are on-demand only)

| Not ported | Why |
|---|---|
| Unit-level specs (`env`, `dbUrl`, `logger`, `validate`, `depositRules`, `billFormat`, `paymentLedger`, `mfaService`, `slack`, `version`, `authz`, `pagination`) | They call functions directly; there is no HTTP surface on a deployed system to test them through. |
| Rate-limit exhaustion (login, PIN, client-error beacon, bulk routes) | Tripping a limit locks the shared IP / PIN for up to an hour and would take the pipeline's own sign-in down with it. Only the limit *headers* are checked. |
| Account lock-out and full MFA enrolment (`accountLock`, `mfa`) | Every attempt counts toward the 20-sign-ins-an-hour limit and lock-outs affect real accounts. Only the token-level 401/400 behaviour is checked. |
| Dispatch-day finalisation | Finalising "today" locks **every** salesperson's entry system-wide and is a global flag. |
| CORS allow-list | The allowed origins are environment configuration, not product behaviour. |

## Layout

```
src/test/resources/features/api/*.feature      scenarios (business language)
src/test/java/com/vmd/automation/
  RunCucumberTest.java        single JUnit Platform suite; pick scenarios with tags
  TestContext.java            per-scenario state (last response, remembered entities, cleanup)
  config/TestConfig.java      every setting, from environment variables
  core/                       framework - no knowledge of VMD endpoints
    ApiClient                 the one place a request is built (base URL, timeouts, JSON headers)
    AuthManager / Role        bearer token per role, one sign-in per role per run
    RateLimitRetryFilter      waits out 429s and cold-start GETs; never retries a write on 5xx
    ExchangeLog               masked request/response evidence, attached to a failed scenario
    Cleanup                   undo-actions, run newest-first, all attempted
    Placeholders              ${alias.field}, ${unique}, ${today+7}, ${repeat:501}
    SalespersonPool           clean salespeople lent to scenarios (see "Rate limits")
    JwtForge                  tokens the server must reject
  fixtures/Fixtures           throwaway brand / category / product / route / salesperson / admin user
  hooks/Hooks                 failure evidence, cleanup after every scenario, run-scoped user removal
  steps/                      CommonSteps (calls + assertions), FixtureSteps, DairySteps,
                              SalespersonLedgerSteps, PricingSteps, LedgerSteps
  api/                        original health / route steps (kept as they were)
```

Feature files contain **no ids, tokens or dates**: entities are remembered under an alias and referred
to as `${brand.id}`; dates are `${today-2}` (India time, the zone the backend validates in).

## Run

```bash
export API_BASE_URL=http://localhost:3001            # backend origin, no /api/v1
export E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... # an admin WITHOUT MFA
export E2E_SUPERADMIN_USERNAME=... E2E_SUPERADMIN_PASSWORD=...   # a superadmin WITHOUT MFA (optional, see below)

mvn test -Dcucumber.filter.tags="@api and not @known-defect"   # what the staging gate runs
mvn test -Dcucumber.filter.tags="@api and @smoke"              # read-only; what production runs
mvn test -Dcucumber.filter.tags="@known-defect"                # the documented API bugs
mvn test -Dcucumber.filter.tags="@dispatch"                    # one area
```

Report: `target/cucumber-reports/report.html` (a failed scenario carries the exact HTTP exchanges).

| Variable | Notes |
|---|---|
| `API_BASE_URL` | backend origin (default `http://localhost:3001`) |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | admin account, **no MFA** (required for anything authenticated) |
| `E2E_SUPERADMIN_USERNAME` / `E2E_SUPERADMIN_PASSWORD` | superadmin account, **no MFA**. Needed by scenarios that create brands, admin users or dispatchers or reset ledgers. If unset and the admin account is itself a superadmin, that account is used. |
| `E2E_STRICT` | `true` = a missing prerequisite **fails** the scenario instead of skipping it. Turn it on in the release gate. |
| `EXPECTED_COMMIT` | commit `/health` must report (CI passes the one the wait script saw running) |
| `HTTP_CONNECT_TIMEOUT_MS` / `HTTP_READ_TIMEOUT_MS` | defaults 30 s / 90 s (a sleeping Render service takes about a minute to wake) |

## Tags

| Tag | Meaning |
|---|---|
| `@api` | every API scenario |
| `@smoke` | **read-only**; safe against production. Never put it on a scenario that writes. |
| `@superadmin` | needs a superadmin session (informational: skipping is automatic) |
| `@known-defect` | expected to fail today; excluded from the gate |
| area tags | `@brands @products @dispatch @ledger @reports @bills @auth ...` for running one area |

## Conventions

* **Business language in features, mechanics in code.** A step name says what the user does or expects;
  HTTP, JSON paths and cleanup live in `steps/`, `core/` and `fixtures/`.
* **Everything a scenario creates is named `E2E-...` and removed afterwards** - pass or fail - by the
  undo-actions its fixtures registered. Brands and products cannot be deleted through the API, so they
  are archived / deactivated: they vanish from every list but their rows remain. For that reason all
  ledger scenarios work on a **throwaway brand**, never on Nandini, Jersey or Gowardhan.
* **Assert on what the scenario created.** Lists on a shared environment contain other people's data, so
  assertions look an item up by its id (`data.find { it.id == ${product.id} }`), never "the first item".
* **A new scenario needs:** the right area tag, `Scenario` names written as a business rule, no
  ids / dates / tokens, and a fixture rather than a hard-coded record. Add `@smoke` only if it is read-only.
* **Never sign in per scenario.** Use a role (`admin calls ...`); the session is cached. Sign-in is
  limited to 20 attempts an hour per address and every attempt counts - a full run uses about 13.

## Rate limits and why `SalespersonPool` exists

The backend limits all `/salespeople` traffic to 30 requests a minute. Creating, wiping and deleting a
salesperson per scenario costs four of those, which stretched a ledger run from about a minute to over
ten. Ledger, dispatch and pricing scenarios therefore borrow a salesperson with `a salesperson with a
clean ledger "sp"`: the pool creates a few once per run and each scenario hands its one back with a
single ledger reset. Scenarios about editing or deleting salespeople use `a throwaway salesperson "sp"`.

`RateLimitRetryFilter` waits out a 429 when the server says the wait is under a minute, and fails
immediately (with the server's message) when it is longer, as it is for sign-in.

## Known defects

`known-defects.feature` records behaviour the real backend gets wrong, found by this suite and not
visible to the mocked specs:

1. A request body that is not valid JSON, or is over 10 KB, returns **500** (and posts a server-error
   Slack card) instead of 400 / 413.
2. A date that does not exist on the calendar is accepted or crashes: `2026-02-30` is **stored as
   2026-03-02**, and `2026-13-45` returns 500 - the Zod schemas only check the `YYYY-MM-DD` pattern.

Fix the server, delete the `@known-defect` tag from the scenario, and it joins the gate.

## Side effects on the environment

Every write fires the normal Slack card. A full run performs several hundred writes, so point the
testing backend's `SLACK_WEBHOOK_URL` at a quiet channel (or leave it unset) before enabling the gate.
