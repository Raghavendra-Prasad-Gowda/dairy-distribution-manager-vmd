#!/usr/bin/env node
// Writes data.json for the pipeline dashboard: recent workflow runs, pull requests and releases.
// Usage: node build-dashboard-data.js <out-dir>   (env: GITHUB_TOKEN, GITHUB_REPOSITORY)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const outDir = process.argv[2];
if (!repo || !outDir) {
  console.error('GITHUB_REPOSITORY and an output directory are required');
  process.exit(1);
}

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

const minutes = (r) => {
  const start = Date.parse(r.run_started_at || r.created_at);
  return Math.round(((Date.parse(r.updated_at) - start) / 60000) * 10) / 10;
};

(async () => {
  const [runsRes, prsRes, releasesRes] = await Promise.all([
    gh('actions/runs?per_page=100'),
    gh('pulls?state=all&sort=updated&direction=desc&per_page=50'),
    gh('releases?per_page=20'),
  ]);

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

  const releases = releasesRes.map((r) => ({ tag: r.tag_name, published_at: r.published_at, url: r.html_url }));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'data.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), repo, runs, prs, releases }),
  );
  console.log(`runs=${runs.length} prs=${prs.length} releases=${releases.length}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
