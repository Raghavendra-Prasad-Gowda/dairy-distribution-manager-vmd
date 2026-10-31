# VMD automation suite

Black-box **API** tests against a **deployed** environment: Cucumber (Gherkin) + REST Assured.
Java 21, Maven. The browser (UI) tests live in [`../automation-ui`](../automation-ui/README.md)
(Playwright + TypeScript). Separate from `server/tests` (mocked Prisma) and `client` Vitest specs —
those run in `pr-checks.yml`; this suite runs in `staging-pipeline.yml` / `production-verify.yml`.

```
src/test/resources/features/api/*.feature   @api   REST Assured scenarios
src/test/java/com/vmd/automation/
  RunCucumberTest.java     single JUnit Platform suite; choose scenarios with tags
  TestContext.java         per-scenario state shared by step classes (PicoContainer)
  config/TestConfig.java   all settings, from environment variables
  api/ApiSteps.java        generic API step definitions
  api/ApiSession.java      logs in once per run (E2E admin), builds authenticated requests
  api/RouteSteps.java      /api/v1/routes steps; deletes every route it created after each scenario
```

## Run

```bash
# Health scenario needs no credentials; authenticated scenarios (routes.feature) need the E2E_ADMIN_* pair
API_BASE_URL=http://localhost:3001 mvn test -Dcucumber.filter.tags="@api"

```

| Variable | Used by | Notes |
|---|---|---|
| `API_BASE_URL` | api | backend origin, no `/api/v1` (default `http://localhost:3001`) |
| `EXPECTED_COMMIT` | api | commit `/health` must report (CI passes the one `wait-for-backend.sh` saw running). Full or 7-char SHA. Unset = skipped |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | api | account **without MFA**; authenticated `@api` scenarios (e.g. `routes.feature`) need it |

Reports: `target/cucumber-reports/report.html`.

## Adding scenarios
- Tag `@api`. Add `@smoke` **only** if it is read-only — smoke runs against production.
- Tests against testing may write data; use clearly named, throwaway records (`E2E-...`) and
  delete them in an `@After` hook, as `RouteSteps` does.
- Log in through `ApiSession.authenticated()`, never per scenario: login is limited to 20/hour.
