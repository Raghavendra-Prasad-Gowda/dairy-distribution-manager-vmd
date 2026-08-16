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

/** Returns tomorrow's date in India timezone as YYYY-MM-DD */
export function getTomorrow() {
  return getNextDate(getIndiaDate());
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

/**
 * Returns the current instant formatted as an IST datetime string, e.g.
 * "24 May 2026, 06:15 pm" — for "Printed on …" footers. `new Date()` with no
 * arguments captures the current moment unambiguously (there's no string to
 * mis-parse), but the formatting still belongs here rather than duplicated at
 * every call site — this was copy-pasted identically across 5 print pages.
 */
export function getIndiaDateTimeStr() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Safely parses an API date value (YYYY-MM-DD or a full ISO datetime string,
 * e.g. a Prisma DateTime like "2026-04-30T00:00:00.000Z") into a local-calendar
 * JS Date anchored to that same calendar day — never `new Date(isoString)`
 * followed by `.toLocaleDateString()` with no explicit timeZone, which silently
 * rolls the displayed date back a day for any browser west of UTC. Once
 * constructed this way, the Date is safe to format however the caller likes.
 */
export function parseLocalDate(dateStr) {
  const ymd = String(dateStr).slice(0, 10);
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Compact "24 May" format (day + month, no year) — for table columns where the
 * year is already shown in a header/date-range. Accepts YYYY-MM-DD or ISO.
 */
export function formatDateShortNoYear(dateStr) {
  if (!dateStr) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = parseLocalDate(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
}

/** Formats as "₹1,23,456.00" in Indian locale */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}
