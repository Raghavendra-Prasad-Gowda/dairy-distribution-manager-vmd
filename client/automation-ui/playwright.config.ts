import { defineConfig, devices } from '@playwright/test';
import { env } from './src/env';

export const ADMIN_STATE = '.auth/admin.json';

/**
 * Screens, by who uses them. Salesmen work from a phone; superadmins, admins and dispatchers
 * from an iPad. The presets bring the real viewport, device scale factor, touch and user agent;
 * `browserName: 'chromium'` keeps the iPads on the one browser CI installs (they default to WebKit).
 */
const phone = { ...devices['Pixel 7'] }; // 412x839, Chromium
const ipadPortrait = { ...devices['iPad (gen 7)'], browserName: 'chromium' as const }; // 810x1080
const ipadScreens = [
  { name: 'ipad-portrait', use: ipadPortrait },
  { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' as const } }, // 1080x810
];

/** Salesman specs live in tests/salesman/; everything else is a superadmin/admin/dispatcher spec. */
const SALESMAN_SPECS = /salesman\/.*\.spec\.ts/;

export default defineConfig({
  testDir: './tests',
  // The deployed testing environment is shared and its free-tier backend is slow to wake.
  timeout: env.uiTimeoutMs * 2,
  expect: { timeout: env.uiTimeoutMs },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Read by the Slack results card in staging-pipeline.yml; lives in test-results/, which CI uploads.
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: env.webBaseUrl,
    actionTimeout: env.uiTimeoutMs,
    navigationTimeout: env.uiTimeoutMs,
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
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: ipadPortrait },

    // Superadmin, admin and dispatcher specs: iPad, both orientations. Portrait (810px) is under
    // the app's `lg` breakpoint (1024px), so it gets the hamburger menu; landscape gets the sidebar.
    ...ipadScreens.flatMap(({ name, use }) => [
      {
        // Specs that exercise the login page itself start signed out.
        name: `signed-out-${name}`,
        testMatch: /login\.spec\.ts/,
        testIgnore: SALESMAN_SPECS,
        use,
      },
      {
        name: `signed-in-${name}`,
        testMatch: /.*\.spec\.ts/,
        testIgnore: [/login\.spec\.ts/, SALESMAN_SPECS],
        dependencies: ['setup'],
        use: { ...use, storageState: ADMIN_STATE },
      },
    ]),

    // Salesman specs: phone. They start signed out; a salesman spec signs in as its own salesman.
    { name: 'salesman-phone', testMatch: SALESMAN_SPECS, use: phone },
  ],
});
