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
