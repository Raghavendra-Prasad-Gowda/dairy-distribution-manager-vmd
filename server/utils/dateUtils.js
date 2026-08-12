/**
 * IST-aware date helpers for the server. Mirror of client/src/utils/dateUtils.js
 * — both sides must agree on what "today" means so lock-by-date decisions don't
 * disagree between UI and API.
 */

/** Returns today's date in India timezone as YYYY-MM-DD. */
function getIndiaDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Returns tomorrow's date in India timezone as YYYY-MM-DD. */
function getIndiaTomorrowStr() {
  const [y, m, d] = getIndiaDateStr().split('-').map(Number);
  const date = new Date(y, m - 1, d + 1); // local calendar arithmetic, no UTC conversion
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

module.exports = { getIndiaDateStr, getIndiaTomorrowStr };
