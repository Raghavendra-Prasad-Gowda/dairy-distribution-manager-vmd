#!/usr/bin/env node
// Writes data.json for the pipeline dashboard: recent workflow runs, pull requests and releases.
// Usage: node build-dashboard-data.js <out-dir>   (env: GITHUB_TOKEN, GITHUB_REPOSITORY)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const outDir = process.argv[2];

async function gh(route) {
  const res = await fetch(`https://api.github.com/repos/${repo}/${route}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vmd-pipeline-dashboard',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${route} -> ${res.status}`);
  return res.json();
}


// ---- API / UI test results, read from the staging-pipeline report artifacts ----------------------
// api-e2e-report holds Cucumber's report.json; ui-e2e-report holds Playwright's test-results/results.json.
// Same counting rules as .github/scripts/slack-test-card.py so the numbers match the Slack cards.
const BAD_STEP = new Set(['failed', 'undefined', 'pending', 'ambiguous']);
const firstLine = (m) => String(m || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

function apiSummary(report) {
  const t = { passed: 0, failed: 0, skipped: 0 };
  const failures = [];
  let ms = 0;
  for (const feature of report) {
    const fname = feature.name || path.basename(feature.uri || '', '.feature');
    let backgroundBad = false;
    for (const el of feature.elements || []) {
      const results = (el.steps || []).map((s) => s.result || {});
      const statuses = results.map((r) => r.status);
      ms += results.reduce((a, r) => a + (r.duration || 0), 0) / 1e6; // nanoseconds
      if (el.type === 'background') { backgroundBad = statuses.some((x) => x !== 'passed'); continue; }
      const bad = backgroundBad || statuses.some((x) => BAD_STEP.has(x));
      if (bad) {
        t.failed += 1;
        failures.push({ name: `${fname} › ${el.name || ''}`, error: firstLine((results.find((r) => r.error_message) || {}).error_message) });
      } else if (statuses.length && statuses.every((x) => x === 'skipped')) t.skipped += 1;
      else t.passed += 1;
    }
  }
  return { ...t, total: t.passed + t.failed + t.skipped, ms: Math.round(ms), unit: 'scenarios', failures: failures.slice(0, 8) };
}

function uiSummary(report) {
  const st = report.stats || {};
  const t = { passed: (st.expected || 0) + (st.flaky || 0), failed: st.unexpected || 0, skipped: st.skipped || 0 };
  const failures = [];
  const walk = (suite, trail) => {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (test.status !== 'unexpected') continue;
        const err = (test.results || []).map((r) => (r.error || {}).message).filter(Boolean).pop();
        failures.push({ name: [test.projectName, ...trail, spec.title].filter(Boolean).join(' › '), error: firstLine(err) });
      }
    }
    for (const child of suite.suites || []) walk(child, child.title ? [...trail, child.title] : trail);
  };
  for (const top of report.suites || []) walk(top, []);
  return { ...t, total: t.passed + t.failed + t.skipped, ms: Math.round(st.duration || 0), unit: 'tests', failures: failures.slice(0, 8) };
}

async function readArtifactJson(artifact, innerPath) {
  const res = await fetch(artifact.archive_download_url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'vmd-pipeline-dashboard', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`artifact ${artifact.name} -> ${res.status}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmd-art-'));
  const zip = path.join(dir, 'a.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const out = execFileSync('unzip', ['-p', zip, innerPath], { maxBuffer: 256 * 1024 * 1024 }).toString();
  fs.rmSync(dir, { recursive: true, force: true });
  return JSON.parse(out);
}

// Newest first; runs that were cancelled or never produced a report are skipped.
async function testHistory(stagingRuns, limit) {
  const out = { api: [], ui: [] };
  if (!token) return out; // artifact downloads need a token
  for (const run of stagingRuns) {
    if (out.api.length >= limit && out.ui.length >= limit) break;
    let artifacts = [];
    try { artifacts = (await gh(`actions/runs/${run.id}/artifacts?per_page=30`)).artifacts || []; } catch (e) { console.warn(e.message); continue; }
    const base = { run_id: run.id, sha: (run.head_sha || '').slice(0, 7), created_at: run.created_at, run_url: run.html_url };
    for (const [key, name, inner, parse] of [['api', 'api-e2e-report', 'report.json', apiSummary], ['ui', 'ui-e2e-report', 'test-results/results.json', uiSummary]]) {
      const art = artifacts.find((a) => a.name === name && !a.expired);
      if (!art || out[key].length >= limit) continue;
      try { out[key].push({ ...base, ...parse(await readArtifactJson(art, inner)) }); } catch (e) { console.warn(`${key} run ${run.id}: ${e.message}`); }
    }
  }
  return out;
}

const minutes = (r) => {
  const start = Date.parse(r.run_started_at || r.created_at);
  return Math.round(((Date.parse(r.updated_at) - start) / 60000) * 10) / 10;
};

async function main() {
  if (!repo || !outDir) throw new Error('GITHUB_REPOSITORY and an output directory are required');
  const [runsRes, recentPrs, openPrs, releasesRes] = await Promise.all([
    gh('actions/runs?per_page=100'),
    gh('pulls?state=all&sort=updated&direction=desc&per_page=50'),
    gh('pulls?state=open&per_page=100'), // every open PR, even ones not touched recently
    gh('releases?per_page=20'),
  ]);
  const seen = new Set();
  const prsRes = [...openPrs, ...recentPrs].filter((p) => !seen.has(p.number) && seen.add(p.number));

  const runs = runsRes.workflow_runs
    .filter((r) => r.event !== 'dynamic') // Dependabot updater runs are noise
    .map((r) => ({
      id: r.id,
      workflow: r.name,
      event: r.event,
      branch: r.head_branch,
      conclusion: r.conclusion || r.status,
      created_at: r.created_at,
      minutes: minutes(r),
      url: r.html_url,
    }));

  const prs = prsRes.map((p) => ({
    number: p.number,
    title: p.title,
    author: p.user && p.user.login,
    state: p.merged_at ? 'merged' : p.state,
    base: p.base.ref,
    kind: p.title.startsWith('Release:') ? 'release' : p.user && p.user.login.startsWith('dependabot') ? 'dependency' : 'change',
    created_at: p.created_at,
    merged_at: p.merged_at,
    url: p.html_url,
  }));

  const stagingRuns = runsRes.workflow_runs.filter((r) => r.name === 'staging-pipeline' && (r.conclusion === 'success' || r.conclusion === 'failure'));
  const tests = await testHistory(stagingRuns, 6);

  const releases = releasesRes.map((r) => ({ tag: r.tag_name, published_at: r.published_at, url: r.html_url }));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'data.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), repo, runs, prs, releases, tests }),
  );
  console.log(`runs=${runs.length} prs=${prs.length} releases=${releases.length} api=${tests.api.length} ui=${tests.ui.length}`);
}

module.exports = { apiSummary, uiSummary };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
