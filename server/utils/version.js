'use strict';

/**
 * Build identity (git tag + commit) for /health, boot logs and Slack cards.
 *
 * Resolved once at module load. Preference order:
 *   1. server/version.json written at build time by scripts/write-version.js
 *   2. live detection (platform env vars, then git)
 * Every lookup is best-effort: on a host with no git metadata the app still
 * boots and reports whatever it could find (commit only, or "unknown").
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pkgVersion = require('../package.json').version;
const VERSION_FILE = path.join(__dirname, '..', 'version.json');

function git(...args) {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'], cwd: __dirname })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

/** Detects tag + commit from the platform env vars, falling back to git. */
function detectVersion() {
  const commit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.SOURCE_VERSION ||
    git('rev-parse', 'HEAD');
  // Tag wins; with no tag (or none in the host's clone) fall back to package.json.
  const tag = process.env.APP_VERSION || git('describe', '--tags', '--abbrev=0') || pkgVersion;
  return {
    version: tag ? tag.replace(/^v/, '') : null,
    commit: commit ? commit.slice(0, 7) : null,
    builtAt: new Date().toISOString(),
  };
}

function loadVersion() {
  try {
    const parsed = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* no build-time file — detect live */ }
  return detectVersion();
}

const appVersion = Object.freeze(loadVersion());

/** Human label, e.g. "v1.4.0 · a3f9c21", "a3f9c21" or "unknown". */
function versionLabel(v = appVersion) {
  const parts = [v.version && `v${v.version}`, v.commit].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'unknown';
}

module.exports = { appVersion, versionLabel, detectVersion, VERSION_FILE };
