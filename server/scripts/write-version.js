'use strict';

// Run at build time (npm run build) so the deployed server knows its tag and
// commit even if the runtime image has no git metadata. Output is gitignored.
const fs = require('fs');
const { detectVersion, VERSION_FILE } = require('../utils/version');

const v = detectVersion();
fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2) + '\n');
console.log(`[version] wrote ${VERSION_FILE}: ${JSON.stringify(v)}`);
