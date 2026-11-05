import { test as base, expect, type Page } from '@playwright/test';

/**
 * Tracks every route a test creates through the UI and hard-deletes whatever is left after the
 * test (pass or fail), so the shared testing database never accumulates "E2E-..." rows.
 * Cleanup talks to the same API origin the frontend used, with the session token from the
 * signed-in browser — no extra configuration or extra login needed.
 */
type Fixtures = {
  trackRoute: (createUrl: string, id: number) => void;
};

async function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('token'));
}

export const test = base.extend<Fixtures>({
  trackRoute: async ({ page }, use) => {
    const created: string[] = [];
    await use((createUrl, id) => created.push(`${createUrl.replace(/\/$/, '')}/${id}`));

    const token = await sessionToken(page).catch(() => null);
    if (!token) return;
    for (const url of created) {
      const res = await page.request.delete(url, { headers: { Authorization: `Bearer ${token}` } });
      // 404 = the test already deleted it through the UI.
      if (res.status() !== 200 && res.status() !== 404) {
        throw new Error(`cleanup: DELETE ${url} -> ${res.status()} ${await res.text()}`);
      }
    }
  },
});

export { expect };
