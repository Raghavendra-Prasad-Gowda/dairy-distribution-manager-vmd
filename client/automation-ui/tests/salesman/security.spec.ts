import { expect, test } from '../../src/fixtures';
import { LoginPage } from '../../src/pages/LoginPage';
import { ChangePasswordPage, signInAsSalesman } from '../../src/pages/SalesmanPages';
import { ShellPage } from '../../src/pages/ShellPage';

/**
 * A salesman's password is the only thing between a stranger and their account. Changing it must demand the current
 * one, enforce the strength rules, and really replace it: the old password stops working and the new one works.
 */
test.describe('Salesman password (phone)', () => {
  test('the update button stays disabled until the new password is strong and confirmed', async ({ page, seed }) => {
    const sp = await seed.salesperson(true);
    await signInAsSalesman(page, sp.username!, sp.password!);
    const change = new ChangePasswordPage(page);
    await change.open();

    await expect(change.update).toBeDisabled();
    await change.fill(sp.password!, 'short1A'); // 7 characters
    await expect(change.update).toBeDisabled();
    await change.fill(sp.password!, 'alllowercase1'); // no capital
    await expect(change.update).toBeDisabled();
    await change.fill(sp.password!, 'NoDigitsHere'); // no number
    await expect(change.update).toBeDisabled();
    await change.fill(sp.password!, 'Valid-Pass-1', 'Valid-Pass-2'); // confirmation differs
    await expect(change.update).toBeDisabled();
    await change.fill(sp.password!, 'Valid-Pass-1');
    await expect(change.update).toBeEnabled();
  });

  test('a wrong current password is refused and the old password keeps working', async ({ page, seed }) => {
    const sp = await seed.salesperson(true);
    await signInAsSalesman(page, sp.username!, sp.password!);
    const change = new ChangePasswordPage(page);
    await change.open();

    await change.fill('Not-The-Current-1', 'Brand-New-Pass-1');
    const refused = page.waitForResponse((r) => r.request().method() === 'POST' && /change-password$/.test(r.url()));
    await change.update.click();
    expect((await refused).status()).toBeGreaterThanOrEqual(400);
    await change.acknowledgeNotice(/incorrect|invalid|wrong|current/i);

    await new ShellPage(page).signOutOnPhone(); // the failed attempt changed nothing: sign back in with the old password
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(sp.username!, sp.password!);
    await expect(page.getByRole('heading', { name: 'Stock Entry' })).toBeVisible();
  });

  test('changing the password replaces it: the old one fails and the new one signs in', async ({ page, seed }) => {
    const sp = await seed.salesperson(true);
    const fresh = `Brand-New-${Date.now().toString(36)}-1A`;

    await signInAsSalesman(page, sp.username!, sp.password!);
    const change = new ChangePasswordPage(page);
    await change.open();
    await change.fill(sp.password!, fresh);
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /change-password$/.test(r.url()));
    await change.update.click();
    expect((await saved).ok()).toBe(true);
    await change.acknowledgeNotice(/password/i);

    // Whatever the app does next (stay signed in or sign out), start from the login page.
    await page.evaluate(() => localStorage.clear());
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(sp.username!, sp.password!); // the old password
    await expect(login.error(/invalid|incorrect|wrong/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await login.signIn(sp.username!, fresh);
    await expect(page.getByRole('heading', { name: 'Stock Entry' })).toBeVisible();
  });
});
