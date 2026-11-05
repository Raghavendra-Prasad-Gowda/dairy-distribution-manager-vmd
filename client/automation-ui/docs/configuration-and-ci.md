# ⚙️ Configuration & CI

[⬅️ Suite README](../README.md) · Pipeline: [docs/08-ci-cd-and-release.md](../../../docs/08-ci-cd-and-release.md)

---

## 1. 🔧 Environment variables (`src/env.ts`)

| Variable | Default | Notes |
|---|---|---|
| `WEB_BASE_URL` | `http://localhost:5173` | Frontend origin, trailing slash stripped |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | — | Admin **without MFA**; read lazily |
| `VERCEL_BYPASS_SECRET` | — | Vercel Protection Bypass for Automation |
| `HEADLESS` | `true` | `false` to watch |
| `UI_TIMEOUT_MS` | `60000` | Action/navigation/expect timeout |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | — | Use a pre-installed Chromium (adds `--no-sandbox`) |
| `CI` | — | Enables `forbidOnly` and 1 retry |

## 2. 🔄 CI integration

```mermaid
flowchart TB
    subgraph PRC["pr-checks.yml · compile-automation-suite"]
        A1[setup-node 22 · cache client/automation-ui/package-lock.json] --> A2[npm ci] --> A3[npm run typecheck]
    end
    subgraph STG["staging-pipeline.yml · ui-automation (needs api-automation)"]
        B1[npm ci] --> B2[npx playwright install --with-deps chromium]
        B2 --> B3[npm test · CI=true]
        B3 --> B4[job summary · ../../.github/scripts/ui-job-summary.py]
        B3 --> B5[upload ui-e2e-report<br/>playwright-report + test-results]
        B5 --> B6[report-staging-verified → 💬 Slack UI card]
    end
```

| Item | Value |
|---|---|
| Working directory | `client/automation-ui` |
| Environment | `staging` (secrets `E2E_ADMIN_*`, `VERCEL_AUTOMATION_BYPASS_SECRET`) |
| Timeout | 30 min |
| Result file | `test-results/results.json` (Slack card + summary) |

## 3. 🧰 Toolchain

| Tool | Version |
|---|---|
| `@playwright/test` | 1.63.0 (pinned exactly) |
| TypeScript | 5.x |
| Node | 22 |
| Browser | Chromium only |
