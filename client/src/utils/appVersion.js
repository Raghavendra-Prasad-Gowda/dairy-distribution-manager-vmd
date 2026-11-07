// Build identity injected by vite.config.js (`define`). The guards keep this
// safe in any context where the globals were not injected.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
export const APP_BUILT_AT = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

/** "v1.4.0 · a3f9c21", just "a3f9c21" when untagged, or "dev" with neither. */
export function formatVersion(version = APP_VERSION, commit = APP_COMMIT) {
  const parts = [version && `v${version}`, commit].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'dev';
}

export const APP_VERSION_LABEL = formatVersion();

/**
 * "24 Oct 2026, 3:02 PM IST" from an ISO timestamp; '' when missing or invalid.
 * Shown in the viewer's own time zone (this is a display of one instant, not a business date, so the
 * IST-only rule for business dates does not apply). `timeZone` is only for tests.
 */
export function formatBuiltAt(iso = APP_BUILT_AT, timeZone) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(d);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  const time = `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
  return `${get('day')} ${get('month')} ${get('year')}, ${time} ${get('timeZoneName')}`;
}

export const APP_BUILT_AT_LABEL = formatBuiltAt();
