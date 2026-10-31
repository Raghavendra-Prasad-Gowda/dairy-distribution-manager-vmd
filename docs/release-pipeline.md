# Release pipeline

```
feat/xyz ──PR──▶ develop ──merge──▶ Render + Vercel auto-deploy TESTING
                  ▲                          │
        PR Checks must pass                  ▼
   (lint, unit tests, build, audit,   staging-pipeline.yml
    automation compile)               1. wait until testing is serving this commit
                                      2. API automation  (REST Assured + Cucumber)
                                      3. UI automation   (Playwright + Cucumber)
                                      4. "Staging Verified" status on the commit
                                      5. open/update the develop → main release PR
                                                  │
                                    human approves + merges (merge commit)
                                                  ▼
                              Render + Vercel auto-deploy PRODUCTION
                                                  │
                                    production-verify.yml
                                    wait → read-only smoke → tag + GitHub Release
```

Deploys are done by Render and Vercel themselves (auto-deploy on push). The workflows never
deploy; they wait for the deploy, then test it.

## Files

| File | Purpose |
|---|---|
| `.github/workflows/pr-checks.yml` | Existing PR gate; now also compiles `automation/` |
| `.github/workflows/staging-pipeline.yml` | After a merge to `develop`: wait → API → UI → verified → release PR |
| `.github/workflows/production-verify.yml` | After a merge to `main`: wait → smoke → tag/release |
| `.github/scripts/wait-for-backend.sh` | Polls `/health` until `commit` equals the pushed SHA |
| `.github/scripts/wait-for-vercel.sh` | Waits for the GitHub Deployment of the Vercel project |
| `automation/` | Java suite (Cucumber + REST Assured + Playwright) — see `automation/README.md` |
| `.github/CODEOWNERS` | Owner is requested on every PR |

## One-time setup (cannot be done from code)

### 1. GitHub repository settings
- **Settings → General → Default branch** → `develop`.
- **Settings → Actions → General → Workflow permissions** → "Allow GitHub Actions to create and
  approve pull requests" (only needed if you skip the GitHub App below).
- **Settings → Rules → Rulesets** (or Branch protection):
  - `develop`: require a PR; required checks = every `PR Checks` job; no force-push.
  - `main`: require a PR; **1 approval**; require review from Code Owners; dismiss stale
    approvals; required checks = every `PR Checks` job **plus `Staging Verified`**; no force-push.
    The release PR (`develop → main`) skips the `PR Checks` jobs (each job has an `if:` guard),
    since `develop` already passed them and `Staging Verified`; GitHub counts skipped jobs as
    passing. Hotfix PRs into `main` still run every job.
  - To select `Staging Verified` as a required check it must have been reported once — merge
    something to `develop` first.

### 2. Testing login account
Create an **admin** user on the **testing** app (Admin Users setup). It must **not** have MFA
enabled or required — the UI suite logs in with username + password only. Never reuse the
production admin.

### 3. Vercel — let automation past Deployment Protection
Vercel project `dairy-distribution-manager-vmd-testing` → Settings → Deployment Protection →
**Protection Bypass for Automation** → generate a secret.

### 4. GitHub Environments and secrets
Create environment **`staging`** (Settings → Environments) with these secrets:

| Secret | Value |
|---|---|
| `E2E_ADMIN_USERNAME` | username from step 2 |
| `E2E_ADMIN_PASSWORD` | its password |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | secret from step 3 |

Optional repository secrets: `SLACK_WEBHOOK_URL` (pipeline result card).
Optional repository variables if URLs change: `STAGING_API_URL`, `STAGING_WEB_URL`,
`STAGING_VERCEL_PROJECT`, `PROD_API_URL`, `PROD_WEB_URL`, `PROD_VERCEL_PROJECT`.

### 5. GitHub App for the release PR (recommended)
A PR opened by the default `GITHUB_TOKEN` does **not** trigger other workflows, so `PR Checks`
would not run on the release PR. Create a GitHub App (Settings → Developer settings → GitHub
Apps) with repository permissions **Pull requests: read & write** and **Contents: read**, install
it on this repo, then add repository secrets `RELEASE_BOT_APP_ID` and `RELEASE_BOT_PRIVATE_KEY`.

### 6. Render / Vercel branch wiring (verified 2026-10-30)
- Render `dairy-distribution-manager-vmd-testing` → branch `develop`, auto-deploy on.
- Render `dairy-distribution-manager-vmd` → branch `main`, auto-deploy on.
- Confirm in Vercel that `…-vmd-testing` deploys `develop` and `dairy-distribution-manager`
  deploys `main`. Both projects were observed in `ERROR` state on their latest deployment —
  fix that first; the pipeline waits for a successful deployment.

## Daily flow
1. `git checkout -b feat/my-change develop` → commit → push → PR into `develop`.
2. `PR Checks` pass → merge.
3. Testing deploys; `Staging Pipeline` runs. Red = look at the run's reports (Actions artifacts).
4. Green = a `Release: develop -> main` PR appears. Review, approve, **merge with a merge commit**.
5. Production deploys; `Production Verify & Release` smoke-tests it and publishes `vX.Y.Z`.

Merges to `develop` while a run is in progress cancel that run and restart on the newest
commit; `Staging Verified` is per-commit, so the release PR is blocked until the newest commit
passes.

## Hotfix
Branch from `main` (`hotfix/…`), PR into `main` (approval + PR Checks still required). After
it ships, open a PR `main → develop` so `develop` gets the fix too.

## Troubleshooting
- **Timed out waiting for backend commit** — Render deploy failed or is stuck; check the Render
  dashboard. The free plan also sleeps; the script allows for a ~1 min wake-up.
- **Vercel wait falls back to an HTTP check** — no GitHub Deployment matched the project name;
  check `gh api repos/<repo>/deployments?sha=<sha>` and adjust `STAGING_VERCEL_PROJECT`.
- **UI test lands on a Vercel login page** — the bypass secret is missing or wrong.
- **UI test fails at sign-in** — the testing admin has MFA enabled, or the password changed.
- **Release PR has no checks** — App secrets are not set (see step 5).
