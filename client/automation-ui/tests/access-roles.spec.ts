import { expect, test } from '../src/fixtures';
import { LoginPage } from '../src/pages/LoginPage';
import { newIpad } from '../src/pages/SalesmanPages';
import { ShellPage } from '../src/pages/ShellPage';

/**
 * Who can see what is a safety rule, not a nicety: a dispatcher must reach only the dispatch sheet and stock balance,
 * never the money screens. Needs a superadmin to create the dispatcher login (skipped without one).
 */
test.describe('Role access', () => {
  test('a dispatcher gets the dispatch screens only, and office screens bounce back', async ({ browser, superSeed }) => {
    const dispatcher = await superSeed.adminUser('dispatcher');
    const ipad = await newIpad(browser);
    const login = new LoginPage(ipad);
    await login.open();
    await login.signIn(dispatcher.username, dispatcher.password);

    await expect(ipad).toHaveURL(/\/salesman\/dispatch-sheet$/);
    await expect(ipad.getByRole('heading', { name: 'Daily Dispatch Sheet' })).toBeVisible();

    const shell = new ShellPage(ipad);
    await expect(shell.link('Dispatch Sheet')).toBeVisible();
    await expect(shell.link('Stock Balance')).toBeVisible();
    await expect(shell.link('Change Password')).toBeVisible();
    for (const hidden of ['Dashboard', 'Payments', 'Collections', 'Statements', 'Profit & Loss', 'Users']) {
      await expect(shell.link(hidden)).toHaveCount(0);
    }

    for (const office of ['/', '/dairy/payments', '/salesman/payments', '/reports/salespeople', '/admin/users']) {
      await ipad.goto(office);
      await expect(ipad).toHaveURL(/\/salesman\/dispatch-sheet$/);
    }

    await ipad.goto('/reports/stock-balance');
    await expect(ipad.getByRole('heading', { name: 'Stock Balance' })).toBeVisible();
    await ipad.context().close();
  });

  test('Profit & Loss needs its own PIN: a wrong PIN is refused, the right one opens the report', async ({ page }) => {
    await page.goto('/salesman/profit-loss');
    const boxes = page.locator('input[type="password"]');
    await expect(boxes).toHaveCount(6);
    await boxes.first().click();
    await page.keyboard.type('000000'); // deliberately wrong; the sixth digit submits it
    await expect(page.getByText(/Incorrect PIN/)).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('the right Profit & Loss PIN opens the report', async ({ page, plPin }) => {
    await page.goto('/salesman/profit-loss');
    const boxes = page.locator('input[type="password"]');
    await boxes.first().click();
    await page.keyboard.type(plPin);
    await expect(boxes).toHaveCount(0); // the PIN prompt closed
    await expect(page.getByRole('main').getByRole('heading').first()).toContainText(/Profit/i);
  });
});
