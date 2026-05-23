/**
 * IST-aware date helpers for the server. Mirror of client/src/utils/dateUtils.js
 * — both sides must agree on what "today" means so lock-by-date decisions don't
 * disagree between UI and API.
 */

/** Returns today's date in India timezone as YYYY-MM-DD. */
function getIndiaDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

module.exports = { getIndiaDateStr };
