# VMD UI automation

Black-box browser tests against a **deployed** environment: [Playwright Test](https://playwright.dev) +
TypeScript. Real browser → real frontend → real API → real database; nothing is mocked. The API
suite lives in [`../automation`](../automation/README.md) (Java).

```
playwright.config.ts   projects: setup → signed-in, plus signed-out (login page itself)
src/env.ts             all settings, from environment variables
src/fixtures.ts        trackRoute: deletes every route a test created, pass or fail
src/pages/             page objects (selectors live here, not in specs)
tests/auth.setup.ts    logs in once through the real form, saves .auth/admin.json
tests/login.spec.ts    sign in, wrong credentials, signed-out redirect
tests/route-setup.spec.ts   add / edit / delete a route, duplicate rejection, empty form
```

## Run

```bash
cd automation-ui
npm ci
npx playwright install --with-deps chromium     # first time only

WEB_BASE_URL=http://localhost:5173 \
E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... \
  npm test            # npm run test:headed to watch; npm run report for the HTML report
```

| Variable | Notes |
|---|---|
| `WEB_BASE_URL` | frontend origin (default `http://localhost:5173`) |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | account **without MFA** |
| `VERCEL_BYPASS_SECRET` | only if the frontend has Vercel Deployment Protection |
| `HEADLESS` | `false` to watch the browser |
| `UI_TIMEOUT_MS` | default 60000 (Render's free plan wakes slowly) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | use an installed Chromium instead of the downloaded one |

Failed tests keep a screenshot and a trace in `test-results/` (`npx playwright show-trace <zip>`).
CI uploads `playwright-report/` and `test-results/` as the `ui-e2e-report` artifact.

## Writing tests
- Put selectors in `src/pages/`, behaviour in `tests/`. Prefer roles/labels over CSS.
- Tests run against the **shared testing environment** and write to it. Use throwaway `E2E-...`
  data and register it with `trackRoute` (or an equivalent fixture) so it is removed afterwards.
- Never run write tests against production.
- Login is limited to 20 attempts/hour: the `setup` project logs in once and the other specs reuse
  that session. A wrong-password test must use an **unknown username** — failed attempts against the
  real admin account count toward its lockout.
- Saves and errors appear in a blocking "Success"/"Error" modal; dismiss it with
  `acknowledgeNotice(...)` before the next interaction.
