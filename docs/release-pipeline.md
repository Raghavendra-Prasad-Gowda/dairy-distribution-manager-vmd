# 🛠️ Release Pipeline — Setup & Troubleshooting

[⬅️ Docs index](README.md) · [How the pipeline behaves: 08-ci-cd-and-release.md](08-ci-cd-and-release.md)

> This is the **operator runbook**: one-time setup that cannot be done from code, the daily flow, and
> troubleshooting. For gates, branching and rollback see [08-ci-cd-and-release.md](08-ci-cd-and-release.md).

```mermaid
flowchart TD
    F[🌿 feat/xyz] -->|PR| PC{✅ pr-checks<br/>lint · unit tests · build · audit · automation compile}
    PC --> DEV[(develop)]
    DEV -->|auto-deploy| T[☁️ Render + Vercel TESTING]
    T --> SP[⚙️ staging-pipeline.yml]
    SP --> S1[1 ⏳ wait until testing serves this commit]
    S1 --> S2[2 🧪 API automation · REST Assured + Cucumber]
    S2 --> S3[3 🎭 UI automation · Playwright + TypeScript]
    S3 --> S4[4 ✅ Staging Verified status]
    S4 --> S5[5 📝 open/update release PR (`release/next` = develop + main + version bump)]
    S5 -->|👤 approve + merge commit| MAIN[(main)]
    MAIN -->|auto-deploy| P[☁️ Render + Vercel PRODUCTION]
    P --> PV[⚙️ production-verify.yml<br/>wait → read-only smoke → tag + GitHub Release]
```

Deploys are done by Render and Vercel themselves (auto-deploy on push). The workflows never
deploy; they wait for the deploy, then test it.

## Files

| File | Purpose |
|---|---|
| `.github/workflows/pr-checks.yml` | Existing PR gate; now also compiles `server/automation/` and type-checks `client/automation-ui/` |
| `.github/workflows/staging-pipeline.yml` | After a merge to `develop`: wait → API → UI → verified → release PR |
| `.github/workflows/production-verify.yml` | After a merge to `main`: wait → smoke → tag/release |
| `.github/workflows/pipeline-dashboard.yml` | Publishes `dashboard/index.html` + fresh `data.json` (runs, PRs, releases) to GitHub Pages after each staging/production run, hourly and on demand, with a live health check of production + testing (frontend + backend) |
| `.github/scripts/build-dashboard-data.js` | Pulls the data the dashboard shows from the GitHub API using the workflow's own token |
| `.github/scripts/wait-for-backend.sh` | Polls `/health` until `commit` equals the pushed SHA, or the running commit has identical `server/` code (Render skips deploys for commits that don't touch `server/`) |
| `.github/scripts/wait-for-vercel.sh` | Waits for the GitHub Deployment of the Vercel project |
| `server/automation/` | Java API suite (Cucumber + REST Assured) — see `server/automation/README.md` and `CLAUDE.md` |
| `client/automation-ui/` | TypeScript UI suite (Playwright Test) — see `client/automation-ui/README.md` and `CLAUDE.md` |
| `.github/CODEOWNERS` | Owner is requested on every PR |

The suites live under the tier they test, so a change to `server/automation/` redeploys the testing backend
(Render's root directory is `server/`) and a change to `client/automation-ui/` redeploys the frontend
(`client/.vercelignore` keeps the suite out of the upload). `wait-for-backend.sh` treats any `server/` change as a
backend change and waits for that deploy. If you add a Render build filter that ignores `server/automation/**`,
exclude the same path in `wait-for-backend.sh`.

## One-time setup (cannot be done from code)

### 1. GitHub repository settings
- **Settings → General → Default branch** → `develop`.
- **Settings → Actions → General → Workflow permissions** → "Allow GitHub Actions to create and
  approve pull requests" (only needed if you skip the GitHub App below).
- **Settings → Rules → Rulesets** (or Branch protection):
  - `develop`: require a PR; required checks = every `pr-checks` job; no force-push.
  - `main`: require a PR; **1 approval**; require review from Code Owners; dismiss stale
    approvals; required checks = every `pr-checks` job **plus `Staging Verified`**; no force-push.
    The release PR (`release/next → main`) skips the `pr-checks` jobs (each job has an `if:` guard),
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
| `E2E_SUPERADMIN_USERNAME` | a **superadmin without MFA** on the testing backend (dedicated to automation) |
| `E2E_SUPERADMIN_PASSWORD` | its password |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | secret from step 3 |

Optional secret `SLACK_WEBHOOK_URL` (repository secret, or a secret of the `staging` environment): when set, every
staging-pipeline run posts two separate cards to the webhook's channel, one for API automation and one for UI
automation. Each shows pass/fail, totals, pass rate, duration, a per-feature (API) or per-spec-file (UI) breakdown,
the failed scenarios/tests with the first line of the error, and a link to the run. To create it: Slack → Apps → *Incoming Webhooks* (or your
workspace's *Workflow Builder*) → add a webhook to the channel that should receive the results, and store its URL as
the secret. Unset = no card. The cards are built by `.github/scripts/slack-test-card.py api|ui` and posted by `.github/scripts/post-slack-card.sh`.

The superadmin pair unlocks the scenarios that create brands, admin users and dispatchers and reset ledgers
(more than half of the API suite: 478 of 872 gate scenarios). Without it those scenarios are skipped; once it is in place, set the
repository **variable** `E2E_STRICT` to `true` so a missing prerequisite fails the run instead of skipping.
Optional repository variables if URLs change: `STAGING_API_URL`, `STAGING_WEB_URL`,
`STAGING_VERCEL_PROJECT`, `PROD_API_URL`, `PROD_WEB_URL`, `PROD_VERCEL_PROJECT`.

### 5. GitHub App for the release PR (recommended)
A PR opened by the default `GITHUB_TOKEN` does **not** trigger other workflows, so `pr-checks`
would not run on the release PR. Create a GitHub App (Settings → Developer settings → GitHub
Apps) with repository permissions **Pull requests: read & write**, **Contents: read & write** and
**Workflows: read & write**, install it on this repo, then add repository secrets `RELEASE_BOT_APP_ID`
and `RELEASE_BOT_PRIVATE_KEY`. Contents write lets auto-merge (5b) merge PRs; Workflows write lets it
merge PRs that change `.github/workflows/`. After changing an app's permissions, accept them on the
app's installation page — until then the old permissions stay in effect.

### 5b. Auto-merge into develop
GitHub's built-in auto-merge needs branch protection, which this private repo's plan does not offer, so
`.github/workflows/auto-merge-develop.yml` does it instead: when `pr-checks` finishes and every job passed,
it merges the PR into `develop` with a merge commit. It skips PRs that are drafts, from forks, that target
anything other than `develop` (the `develop → main` release PR stays manual), that have the
`no-auto-merge` label, or that got new commits after the checks ran (`--match-head-commit`).
It runs from the default branch, so it takes effect once it is merged into `develop`.
With the GitHub App from section 5 (give it **Contents: read & write** as well) the merge triggers
`staging-pipeline` normally; without it, or if the app is refused (for example it only has Contents: read), the workflow merges with the default token and starts `staging-pipeline` itself via `workflow_dispatch`.
This is not an enforced gate: anyone with write access can still merge manually.

### 6. Render / Vercel branch wiring (verified 2026-10-30)
- Render `dairy-distribution-manager-vmd-testing` → branch `develop`, auto-deploy on.
- Render `dairy-distribution-manager-vmd` → branch `main`, auto-deploy on.
- Confirm in Vercel that `…-vmd-testing` deploys `develop` and `dairy-distribution-manager`
  deploys `main`. Both projects were observed in `ERROR` state on their latest deployment —
  fix that first; the pipeline waits for a successful deployment.

### 7. Pipeline dashboard (GitHub Pages)
- **Settings → Pages → Build and deployment → Source** → "GitHub Actions" (needs a public repo, or a plan with Pages).
- Run `pipeline-dashboard` once from the Actions tab (`workflow_dispatch`); the URL appears on the run and under
  Settings → Pages. After that it refreshes by itself.
- If the deploy is refused, check **Settings → Environments → github-pages → Deployment branches** allows `develop`.
- The dashboard URL is `https://<owner>.github.io/<repo>/` (override with the repository variable `DASHBOARD_URL`). The
  release PR body and the Slack test cards link to it.
- The page shows only what the public API already exposes. Keep it that way: do not add anything from secrets or logs.

## Daily flow
1. `git checkout -b feat/my-change develop` → commit → push → PR into `develop`.
2. `pr-checks` pass → the PR merges itself (`auto-merge-develop`). Add the `no-auto-merge` label to keep a PR for a manual merge.
3. Testing deploys; `staging-pipeline` runs. Red = look at the run's reports (Actions artifacts).
4. Green = a `Release: develop -> main` PR appears. Review, approve, **merge with a merge commit**.
5. Production deploys; `production-verify-and-release` smoke-tests it and publishes `vX.Y.Z`.

Merges to `develop` while a run is in progress cancel that run and restart on the newest
commit; `Staging Verified` is per-commit, so the release PR is blocked until the newest commit
passes.

## Hotfix
Branch from `main` (`hotfix/…`), PR into `main` (approval + pr-checks still required). After
it ships, open a PR `main → develop` so `develop` gets the fix too.

## Troubleshooting
- **Timed out waiting for backend commit** — Render deploy failed or is stuck; check the Render
  dashboard. The free plan also sleeps; the script allows for a ~1 min wake-up.
- **Vercel wait falls back to an HTTP check** — no GitHub Deployment matched the project name;
  check `gh api repos/<repo>/deployments?sha=<sha>` and adjust `STAGING_VERCEL_PROJECT`.
- **UI test lands on a Vercel login page** — the bypass secret is missing or wrong.
- **UI test fails at sign-in** — the testing admin has MFA enabled, or the password changed.
- **Release PR has no checks** — App secrets are not set (see step 5).
- **Auto-merge fails with `Resource not accessible by integration (mergePullRequest)`** — the App lacks
  Contents: read & write, or the new permissions were not accepted on the installation (see step 5).
- **Auto-merge fails with `GraphQL: Something went wrong` on a PR that edits `.github/workflows/`** —
  the App lacks Workflows: read & write. The default `GITHUB_TOKEN` can never merge such PRs.
- **Auto-merge failed before a permission fix** — re-run that `auto-merge-develop` run (Actions → the run →
  Re-run jobs). Each run mints a fresh App token, so the re-run picks up the new permissions.


## Version numbers

Vercel's clone has no git tags, so a build cannot read `git describe`. The release number is therefore baked in
before the build: `staging-pipeline` (`open-release-pr`) cuts `release/next` from the verified develop commit,
merges `main`, runs `npm version <next>` in `server/` and `client/` (next = latest `vX.Y.Z` tag + patch,
via `.github/scripts/next-version.sh`), copies the `Staging Verified` status onto that commit and opens the PR
from it. Render/Vercel build `main` with that `package.json` version; `production-verify` tags the same number.
A manual `workflow_dispatch` (minor/major) or hotfix without a bump falls back to computing the tag, with a warning.
