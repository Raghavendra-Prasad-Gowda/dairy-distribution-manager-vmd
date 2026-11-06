import { test as base, expect, type Page } from '@playwright/test';
import { env } from './env';
import { Seed } from './seed';

/**
 * Tracks every route a test creates through the UI and hard-deletes whatever is left after the
 * test (pass or fail), so the shared testing database never accumulates "E2E-..." rows.
 * Cleanup talks to the same API origin the frontend used, with the session token from the
 * signed-in browser — no extra configuration or extra login needed.
 */
type Fixtures = {
  /** Registers anything created through the UI (`POST <collection>` -> `DELETE <collection>/<id>`). */
  trackCreated: (createUrl: string, id: number) => void;
  /** Same as `trackCreated`; kept so existing route specs read naturally. */
  trackRoute: (createUrl: string, id: number) => void;
  /** Arrange-by-API helper with automatic cleanup. Skips the test when API_BASE_URL is not configured. */
  seed: Seed;
  /** Like `seed`, but also skips unless a superadmin is configured (needed to create a throwaway brand). */
  superSeed: Seed;
  /** The edit PIN (E2E_EDIT_PIN). Skips the test when it is not configured. */
  editPin: string;
};

async function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('token'));
}

export const test = base.extend<Fixtures>({
  trackCreated: async ({ page }, use) => {
    const created: string[] = [];
    await use((createUrl, id) => created.push(`${createUrl.replace(/\/$/, '')}/${id}`));

    const token = await sessionToken(page).catch(() => null);
    if (!token) return;
    for (const url of created) {
      let res = await page.request.delete(url, { headers: { Authorization: `Bearer ${token}` } });
      // Bulk-limited routes answer 429 for a minute; wait it out rather than leave test data behind.
      for (let attempt = 0; res.status() === 429 && attempt < 3; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(Number(res.headers()['retry-after']) || 20, 65) * 1000));
        res = await page.request.delete(url, { headers: { Authorization: `Bearer ${token}` } });
      }
      // 404 = the test already deleted it through the UI.
      if (res.status() !== 200 && res.status() !== 404) {
        throw new Error(`cleanup: DELETE ${url} -> ${res.status()} ${await res.text()}`);
      }
    }
  },
  trackRoute: async ({ trackCreated }, use) => {
    await use(trackCreated);
  },
  seed: async ({}, use, testInfo) => {
    const missing = !env.apiBaseUrl;
    if (missing && env.strict) throw new Error('API_BASE_URL is required (E2E_STRICT=true)');
    testInfo.skip(missing, 'API_BASE_URL is not set');
    const seed = new Seed();
    try {
      await use(seed);
    } finally {
      await seed.dispose();
    }
  },
  editPin: async ({}, use, testInfo) => {
    if (!env.editPin && env.strict) throw new Error('E2E_EDIT_PIN is required (E2E_STRICT=true)');
    testInfo.skip(!env.editPin, 'E2E_EDIT_PIN is not set');
    await use(env.editPin);
  },
  superSeed: async ({ seed }, use, testInfo) => {
    const missing = !env.superadminUsername || !env.superadminPassword;
    if (missing && env.strict) throw new Error('E2E_SUPERADMIN_* is required (E2E_STRICT=true)');
    testInfo.skip(missing, 'E2E_SUPERADMIN_* is not set');
    await use(seed);
  },
});

export { expect };
