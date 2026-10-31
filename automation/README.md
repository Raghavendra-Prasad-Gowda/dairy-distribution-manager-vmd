# VMD automation suite

Black-box tests against a **deployed** environment: Cucumber (Gherkin) + REST Assured for the API,
Playwright for the UI. Java 21, Maven. Separate from `server/tests` (mocked Prisma) and
`client` Vitest specs — those run in `pr-checks.yml`; this suite runs in
`staging-pipeline.yml` / `production-verify.yml`.

```
src/test/resources/features/api/*.feature   @api   REST Assured scenarios
src/test/resources/features/ui/*.feature    @ui    Playwright scenarios
src/test/java/com/vmd/automation/
  RunCucumberTest.java     single JUnit Platform suite; choose scenarios with tags
  TestContext.java         per-scenario state shared by step classes (PicoContainer)
  config/TestConfig.java   all settings, from environment variables
  api/ApiSteps.java        generic API step definitions
  api/ApiSession.java      logs in once per run (E2E admin), builds authenticated requests
  api/RouteSteps.java      /api/v1/routes steps; deletes every route it created after each scenario
  ui/UiHooks.java          browser per scenario, screenshot + trace on failure
  ui/UiSteps.java          UI step definitions
  ui/pages/                page objects
```

## Run

```bash
# API (no credentials needed for the health scenario)
API_BASE_URL=http://localhost:3001 mvn test -Dcucumber.filter.tags="@api"

# UI — first time only, download the browser:
mvn test-compile org.codehaus.mojo:exec-maven-plugin:3.5.0:java \
  -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.classpathScope=test \
  -Dexec.args="install --with-deps chromium"

WEB_BASE_URL=http://localhost:5173 E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... \
  mvn test -Dcucumber.filter.tags="@ui"
```

| Variable | Used by | Notes |
|---|---|---|
| `API_BASE_URL` | api | backend origin, no `/api/v1` (default `http://localhost:3001`) |
| `WEB_BASE_URL` | ui | frontend origin (default `http://localhost:5173`) |
| `EXPECTED_COMMIT` | api | full SHA; asserts `/health` is serving that build. Unset = skipped |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | ui, api | account **without MFA**; authenticated `@api` scenarios (e.g. `routes.feature`) need it |
| `VERCEL_BYPASS_SECRET` | ui | only if the frontend has Vercel Deployment Protection |
| `HEADLESS` | ui | `false` to watch the browser |
| `UI_TIMEOUT_MS` | ui | default 60000 (Render's free plan wakes slowly) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | ui | use an installed Chromium instead of the downloaded one |

Reports: `target/cucumber-reports/report.html`. Failed UI scenarios also attach a screenshot and
write a Playwright trace to `target/traces/` (open with `npx playwright show-trace <zip>`).

## Adding scenarios
- Tag `@api` or `@ui`. Add `@smoke` **only** if it is read-only — smoke runs against production.
- UI: add a page object under `ui/pages/`, keep selectors there, not in steps.
- Tests against testing may write data; use clearly named, throwaway records (`E2E-...`) and
  delete them in an `@After` hook, as `RouteSteps` does.
- Log in through `ApiSession.authenticated()`, never per scenario: login is limited to 20/hour.
