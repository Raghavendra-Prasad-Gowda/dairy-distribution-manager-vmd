const prisma = require('../lib/prisma');
const { getIndiaDateStr } = require('../utils/dateUtils');

/**
 * A date is "finalized" for dispatcher purposes if EITHER:
 *   - it is strictly before today (IST) — auto-finalized, no row ever needed, or
 *   - an explicit DispatchDayFinalization row exists for it (written only for
 *     "today", at the moment of manual finalization).
 * A future date is never finalized.
 *
 * dateStr/todayStr are both YYYY-MM-DD strings so this only ever does a plain
 * lexical comparison for the past/future cases — the DB is only hit when the
 * date in question actually is today.
 */
async function isDayFinalizedForDispatcher(dateStr, todayStr = getIndiaDateStr()) {
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const row = await prisma.dispatchDayFinalization.findUnique({ where: { date: new Date(dateStr) } });
  return !!row;
}

module.exports = { isDayFinalizedForDispatcher };
