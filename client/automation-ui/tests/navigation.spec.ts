import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/DashboardPage';
import { ShellPage } from '../src/pages/ShellPage';

/**
 * The cheapest, broadest regression net: every admin screen must open, show its heading and finish loading
 * without a crash screen, an uncaught script error or a failing (5xx) API call. A broken import, a renamed
 * route, a lazy-chunk problem or a server error on first load shows up here before it reaches a user.
 */
const screens: Array<{ path: string; heading: string | RegExp }> = [
  { path: '/', heading: 'Dashboard' },
  { path: '/dairy/stock/nandini', heading: /Nandini Stock Receipt/ },
  { path: '/dairy/payments', heading: 'Dairy Payments' },
  { path: '/dairy/setup', heading: 'Dairy Settings' },
  { path: '/dairy/setup/categories', heading: 'Category Setup' },
  { path: '/dairy/setup/products', heading: 'Product Setup' },
  { path: '/dairy/setup/layout', heading: 'Layout Settings' },
  { path: '/dairy/setup/routes', heading: 'Route Setup' },
  { path: '/dairy/setup/brands', heading: 'Brands' },
  { path: '/salesman/payments', heading: 'Collections' },
  { path: '/salesman/setup/users', heading: 'Salesman Users' },
  { path: '/salesman/setup/prices', heading: 'Products & Prices' },
  { path: '/dairy/reports', heading: 'Dairy Reports' },
  { path: '/reports/dairy', heading: 'Dairy Statement' },
  { path: '/reports/salespeople', heading: 'Salesperson Statement' },
  { path: '/salesman/dispatch-sheet', heading: 'Daily Dispatch Sheet' },
  { path: '/salesman/day-balance', heading: 'Day Balance' },
  { path: '/reports/stock', heading: 'Stock Summary' },
  { path: '/reports/stock-balance', heading: 'Stock Balance' },
  { path: '/reports/deposit', heading: 'Deposit Report' },
  { path: '/salesperson-outstanding', heading: 'Salesperson Outstanding' },
];

test.describe('Every admin screen opens cleanly', { tag: '@layout' }, () => {
  for (const { path, heading } of screens) {
    test(`${path}`, async ({ page }) => {
      const scriptErrors: string[] = [];
      const serverErrors: string[] = [];
      page.on('pageerror', (e) => scriptErrors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 500) serverErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });

      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('Loading…')).toHaveCount(0); // page-level loader finished

      expect(scriptErrors, 'uncaught script errors').toEqual([]);
      expect(serverErrors, 'server errors while loading').toEqual([]);
    });
  }

  test('Profit & Loss is behind its own PIN gate', async ({ page }) => {
    await page.goto('/salesman/profit-loss');
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});

test.describe('Navigation', { tag: '@layout' }, () => {
  test('the menu reaches the main areas (sidebar on landscape, drawer on portrait)', async ({ page }) => {
    const shell = new ShellPage(page);
    await page.goto('/');
    await expect(new DashboardPage(page).heading).toBeVisible();

    const trips: Array<[menuLabel: string, url: RegExp]> = [
      ['Payments', /\/dairy\/payments$/],
      ['Products', /\/dairy\/setup\/products$/],
      ['Collections', /\/salesman\/payments$/],
      ['Users', /\/salesman\/setup\/users$/],
      ['Pricing', /\/salesman\/setup\/prices$/],
      ['Dispatch Sheet', /\/salesman\/dispatch-sheet$/],
      ['Statements', /\/reports\/salespeople$/],
      ['Dashboard', /\/$/],
    ];
    for (const [label, url] of trips) {
      await shell.goTo(label);
      await expect(page).toHaveURL(url);
    }
  });

  test('old bookmarks still land on the right screen', async ({ page }) => {
    const redirects: Array<[from: string, to: RegExp]> = [
      ['/payments/dairy', /\/dairy\/payments$/],
      ['/payments/salespeople', /\/salesman\/payments$/],
      ['/setup/products', /\/dairy\/setup\/products$/],
      ['/setup/salespeople', /\/salesman\/setup\/users$/],
      ['/reports/bills', /\/reports\/salespeople$/],
      ['/daily/receipt', /\/dairy\/stock\/nandini$/],
    ];
    for (const [from, to] of redirects) {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    }
  });

  test('an unknown address falls back to the dashboard', async ({ page }) => {
    await page.goto('/no/such/screen');
    await expect(page).toHaveURL(/\/$/);
    await expect(new DashboardPage(page).heading).toBeVisible();
  });

  test('Admin Users is for superadmins only: other admins are sent back to the dashboard', async ({ page }) => {
    await page.goto('/');
    const role = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('user') ?? '{}').role as string | undefined;
      } catch {
        return undefined;
      }
    });
    await page.goto('/admin/users');
    if (role === 'superadmin') {
      await expect(page.getByRole('heading', { name: 'Admin Users' }).first()).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/$/);
      await expect(new DashboardPage(page).heading).toBeVisible();
    }
  });
});
