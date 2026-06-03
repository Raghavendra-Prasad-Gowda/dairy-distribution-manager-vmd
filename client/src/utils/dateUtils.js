/**
 * Always use these helpers — never use new Date() directly in the frontend.
 * Dates are normalised to India time (IST = UTC+5:30).
 */

/** Returns today's date in India timezone as YYYY-MM-DD */
export function getIndiaDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Returns the date N days before the given date (default: 1 day before today) */
export function getPrevDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d - 1); // local calendar arithmetic, no UTC conversion
  return _fmt(date);
}

/** Returns the date N days after the given date */
export function getNextDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + 1); // local calendar arithmetic, no UTC conversion
  return _fmt(date);
}

function _fmt(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Returns yesterday's date in India timezone as YYYY-MM-DD */
export function getYesterday() {
  return getPrevDate(getIndiaDate());
}

/** Returns first day of current month as YYYY-MM-DD */
export function getFirstDayOfMonth() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return d.slice(0, 8) + '01';
}

/** Formats as "Tuesday, April 8, 2026" — parses without timezone drift */
export function formatDateDisplay(dateStr) {
  // Parse YYYY-MM-DD as a local-calendar date. Using `new Date(dateStr +
  // 'T00:00:00')` is UTC-anchored — on a browser west of UTC, it formats
  // back as the previous day. We split and construct so the date stays put.
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Compact "24 May 2026" format — safe for any browser TZ. Accepts YYYY-MM-DD or ISO. */
export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const ymd = String(dateStr).slice(0, 10);
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Formats as "₹1,23,456.00" in Indian locale */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount ?? 0));
}
