# ⚙️ Configuration & CI

[⬅️ Suite README](../README.md) · Pipeline: [docs/08-ci-cd-and-release.md](../../../docs/08-ci-cd-and-release.md)

---

## 1. 🔧 Environment variables (`config/TestConfig.java`)

| Variable | Default | Notes |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3001` | Backend origin, **no** `/api/v1` |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | — | Admin **without MFA**; required for authenticated scenarios |
| `E2E_SUPERADMIN_USERNAME` / `E2E_SUPERADMIN_PASSWORD` | — | Superadmin **without MFA**; falls back to the admin account if it is a superadmin |
| `E2E_STRICT` | `false` | `true` → missing prerequisite fails instead of skipping |
| `EXPECTED_COMMIT` | — | Commit `/health` must report (health scenario) |
| `HTTP_CONNECT_TIMEOUT_MS` / `HTTP_READ_TIMEOUT_MS` | 30 000 / 90 000 | Sleeping Render service needs ~1 min |

## 2. 🔄 CI integration

```mermaid
flowchart TB
    subgraph PRC["pr-checks.yml · compile-automation-suite"]
        P1[setup-java 21 temurin + maven cache<br/>server/automation/pom.xml] --> P2[mvn -B -ntp test-compile]
    end
    subgraph STG["staging-pipeline.yml · api-automation (environment: staging)"]
        S1[wait-for-testing-deploy → backend_commit] --> S2[mvn -B -ntp test<br/>gate tags]
        S2 --> S3[job summary from report.json]
        S2 --> S4[upload api-e2e-report]
        S4 --> S5[report-staging-verified → 💬 Slack API card]
    end
    subgraph PRD["production-verify.yml"]
        R1[wait for prod deploy] --> R2["mvn -B -ntp test · @api and @smoke"] --> R3[upload prod-smoke-report]
    end
```

| Item | Value |
|---|---|
| Working directory | `server/automation` |
| Secrets | `E2E_ADMIN_*`, `E2E_SUPERADMIN_*` (GitHub Environment `staging`) |
| Variable | `E2E_STRICT` |
| `EXPECTED_COMMIT` | Output of `wait-for-backend.sh` (differs from the pushed SHA when Render skipped a deploy) |
| Timeout | 75 min |
| Artifacts | `server/automation/target/cucumber-reports` |

## 3. 📊 Reports

| File | Consumer |
|---|---|
| `target/cucumber-reports/report.html` | Humans — includes masked HTTP exchanges for failures |
| `target/cucumber-reports/report.json` | Job summary script, Slack card (`.github/scripts/slack-test-card.py`) |

> Do not change the report paths (`junit-platform.properties`) without updating the workflows and scripts.

## 4. 🧰 Toolchain

| Tool | Version |
|---|---|
| Java | 21 (`maven.compiler.release`) |
| Cucumber | 7.20 (JUnit Platform engine) |
| REST Assured | 5.5 |
| Build | Maven (`pom.xml`) |
