#!/usr/bin/env node
'use strict';

/**
 * Dependency vulnerability gate — replaces a bare `npm audit --audit-level`.
 *
 * A bare threshold can't distinguish "a new moderate-or-worse advisory just
 * landed" from "the one accepted, unreachable advisory is still there" — it
 * fails on both, which either blocks every PR forever or gets silenced
 * wholesale (hiding the next real one). This script fails on anything NOT
 * explicitly accepted below, and accepts only by exact package + advisory ID
 * + severity, so a *new* advisory on an already-accepted package still fails.
 *
 * ACCEPTED_RISKS — review before adding an entry. Each one needs a reason
 * this app can never actually be exploited by it, not just "no fix exists".
 */
const ACCEPTED_RISKS = [
  {
    package: 'mysql2',
    severity: 'high',
    advisories: ['GHSA-3f6p-5ww8-9rcr', 'GHSA-rgwj-5xj2-c3m3'],
    reason:
      "Bundled by the prisma CLI package for its multi-database driver support, " +
      "not by @prisma/client (the runtime this app actually imports). " +
      "schema.prisma declares provider = \"postgresql\" — Prisma never loads " +
      "the mysql2 driver for a Postgres datasource, so this code path is " +
      "unreachable here. Fixing it upstream requires downgrading prisma to " +
      "6.19.3 (see fixAvailable), undoing the deliberate Prisma 7 migration " +
      "and losing prisma.config.ts support that index.js's boot sequence " +
      "relies on — a strictly worse trade than an unreachable advisory.",
  },
  {
    package: 'prisma',
    severity: 'moderate',
    advisories: [], // flagged only because it depends on mysql2 — no CVE of its own
    reason: 'Flagged solely for depending on mysql2 (see that entry above), not for its own code.',
  },
];

const { execSync } = require('child_process');

function findAccepted(pkgName, severity, advisoryIds) {
  return ACCEPTED_RISKS.find((r) =>
    r.package === pkgName &&
    r.severity === severity &&
    advisoryIds.every((id) => r.advisories.length === 0 || r.advisories.includes(id))
  );
}

let report;
try {
  // npm audit exits non-zero whenever vulnerabilities exist, so capture
  // stdout regardless of exit status rather than treating that as failure.
  const out = execSync('npm audit --json', { encoding: 'utf8' });
  report = JSON.parse(out);
} catch (err) {
  // execSync throws on non-zero exit, but npm audit still wrote JSON to stdout.
  if (err.stdout) {
    report = JSON.parse(err.stdout);
  } else {
    console.error('✗ npm audit did not return parseable output.');
    console.error(err.message);
    process.exit(1);
  }
}

const vulns = report.vulnerabilities || {};
const failures = [];
const accepted = [];

for (const [pkgName, v] of Object.entries(vulns)) {
  const advisoryIds = (v.via || [])
    .filter((entry) => typeof entry === 'object' && entry.url)
    .map((entry) => entry.url.split('/').pop());

  const match = findAccepted(pkgName, v.severity, advisoryIds);
  if (match) {
    accepted.push({ pkgName, severity: v.severity, reason: match.reason });
  } else if (v.severity === 'moderate' || v.severity === 'high' || v.severity === 'critical') {
    failures.push({ pkgName, severity: v.severity, advisoryIds });
  }
  // low/info severities are ignored either way, matching --audit-level=moderate.
}

if (accepted.length > 0) {
  console.log('Accepted (known, documented, unreachable in this app):');
  for (const a of accepted) {
    console.log(`  - ${a.pkgName} (${a.severity}): ${a.reason}`);
  }
  console.log('');
}

if (failures.length > 0) {
  console.error('✗ Unaccepted vulnerabilities found:');
  for (const f of failures) {
    console.error(`  - ${f.pkgName} (${f.severity}): ${f.advisoryIds.join(', ') || 'see npm audit for detail'}`);
  }
  console.error('');
  console.error('Run `npm audit` for full detail. Either fix it, or add a reviewed');
  console.error('entry to ACCEPTED_RISKS in this script with a real justification.');
  process.exit(1);
}

console.log('✓ Dependency vulnerability scan passed — no unaccepted moderate-or-worse advisories.');
