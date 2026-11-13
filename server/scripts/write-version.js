'use strict';

// Run at build time (npm run build) so the deployed server knows its tag and
// commit even if the runtime image has no git metadata. Output is gitignored.
//
// The version is the higher of the detected one (APP_VERSION / git tag / package.json) and the
// latest published GitHub release. Production builds carry the release bump in package.json, so
// they are unaffected; the testing build (developed from `develop`, whose package.json lags
// behind) therefore shows the same version as production. The lookup is best-effort.
const fs = require('fs');
const { detectVersion, maxVersion, VERSION_FILE } = require('../utils/version');

const DEFAULT_REPO = 'Raghavendra-Prasad-Gowda/dairy-distribution-manager-vmd';

async function latestReleaseTag() {
  if (process.env.APP_VERSION) return null; // an explicit override always wins
  const repo = process.env.RELEASE_REPO || DEFAULT_REPO;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'vmd-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()).tag_name || null;
  } catch {
    return null;
  }
}

(async () => {
  const v = detectVersion();
  const released = await latestReleaseTag();
  if (released) v.version = maxVersion(v.version, released);
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2) + '\n');
  console.log(`[version] wrote ${VERSION_FILE}: ${JSON.stringify(v)}`);
})();
