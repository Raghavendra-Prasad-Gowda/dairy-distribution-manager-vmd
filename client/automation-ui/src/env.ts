/**
 * All environment-specific settings come from environment variables so the same suite runs
 * locally and against the staging deployment. Nothing secret is hard-coded here.
 */
function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Environment variable ${name} is required but not set`);
  return value;
}

export const env = {
  /** Frontend origin, no trailing slash. */
  webBaseUrl: optional('WEB_BASE_URL', 'http://localhost:5173').replace(/\/$/, ''),
  /** Vercel "Protection Bypass for Automation" secret. Empty = frontend is not protected. */
  vercelBypassSecret: optional('VERCEL_BYPASS_SECRET'),
  /** Local Chromium binary to use instead of Playwright's downloaded one. Optional. */
  chromiumExecutablePath: optional('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'),
  /** Render's free plan sleeps; the first request after a deploy can take ~1 min. */
  uiTimeoutMs: Number(optional('UI_TIMEOUT_MS', '60000')),
  headless: optional('HEADLESS', 'true').toLowerCase() !== 'false',
  /** Account **without MFA**. Read lazily so specs that don't log in don't need credentials. */
  adminUsername: () => required('E2E_ADMIN_USERNAME'),
  adminPassword: () => required('E2E_ADMIN_PASSWORD'),
};
