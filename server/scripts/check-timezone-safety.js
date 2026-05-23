#!/usr/bin/env node
'use strict';

/**
 * Timezone-safety lint guard.
 *
 * Fails CI when any file under controllers/ or services/ contains a Prisma
 * date-range filter that compares a stored DATE column against `new Date()`
 * (the UTC instant). That pattern caused the salesperson-price bug — between
 * 00:00–05:30 IST the UTC clock is still on the previous day, so rows saved
 * with today's IST date were silently excluded.
 *
 * Always compare against the IST date instead:
 *   ❌ effectiveFrom: { lte: new Date() }
 *   ✅ effectiveFrom: { lte: new Date(getIndiaDateStr()) }
 *
 * Allowed: `new Date()` as a fallback default or for non-DB use (logger,
 * audit timestamps). Only Prisma where-filter operators are blocked.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['controllers', 'services'];

// Matches lte/gte/lt/gt followed by colon-space-new Date() within a few chars.
// Tolerates whitespace and surrounding braces; ignores `new Date(<arg>)` calls
// where an argument is supplied — those are user-input parsing, not "now".
const BAD = /\b(lte|gte|lt|gt)\s*:\s*new\s+Date\s*\(\s*\)/g;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && /\.js$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

let violations = 0;
for (const sub of DIRS) {
  const base = path.join(ROOT, sub);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    const text  = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      // Skip comments — including the explanatory note in salespersonPrices
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[^]*?\*\//g, '');
      let m;
      const re = new RegExp(BAD.source, 'g');
      while ((m = re.exec(stripped)) !== null) {
        violations += 1;
        const rel = path.relative(ROOT, file);
        console.error(`  ${rel}:${i + 1}  ${line.trim()}`);
        console.error(`    → ${m[1]}: new Date() compares a stored DATE column to the UTC instant; use new Date(getIndiaDateStr()) instead.`);
      }
    });
  }
}

if (violations > 0) {
  console.error('');
  console.error(`✗ ${violations} timezone-unsafe filter${violations === 1 ? '' : 's'} found.`);
  console.error('  See server/controllers/salespersonPrices.controller.js for the safe pattern.');
  process.exit(1);
}

console.log('✓ Timezone-safety check passed — no naive `lte/gte: new Date()` filters in controllers or services.');
