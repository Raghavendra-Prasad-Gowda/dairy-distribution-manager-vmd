import { defineConfig, devices } from '@playwright/test';
import { env } from './src/env';

export const ADMIN_STATE = '.auth/admin.json';

/**
 * Screens every spec runs on. The iPad presets bring the real iPad viewport, device scale
 * factor, touch and user agent; `browserName: 'chromium'` keeps them on the one browser CI
 * installs (the presets default to WebKit).
 */
const screens = [
  { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' as const } },
  { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' as const } },
];

export default defineConfig({
  testDir: './tests',
  // The deployed testing environment is shared and its free-tier backend is slow to wake.
  timeout: env.uiTimeoutMs * 2,
  expect: { timeout: env.uiTimeoutMs },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.webBaseUrl,
    actionTimeout: env.uiTimeoutMs,
    navigationTimeout: env.uiTimeoutMs,
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      headless: env.headless,
      ...(env.chromiumExecutablePath
        ? { executablePath: env.chromiumExecutablePath, args: ['--no-sandbox'] }
        : {}),
    },
  },
  projects: [
    // Logs in once through the real login form and saves the session. Login is limited to
    // 20 attempts/hour, so the other specs reuse this session instead of logging in again.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Every spec runs once per screen below. iPad portrait (810px) is under the app's `lg`
    // breakpoint (1024px), so it gets the hamburger/mobile layout; landscape gets the sidebar.
    ...screens.flatMap(({ name, use }) => [
      {
        // Specs that exercise the login page itself start signed out.
        name: `signed-out-${name}`,
        testMatch: /login\.spec\.ts/,
        use,
      },
      {
        name: `signed-in-${name}`,
        testMatch: /.*\.spec\.ts/,
        testIgnore: /login\.spec\.ts/,
        dependencies: ['setup'],
        use: { ...use, storageState: ADMIN_STATE },
      },
    ]),
  ],
});
