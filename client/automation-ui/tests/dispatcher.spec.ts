import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { DispatchSheetPage } from '../src/pages/DispatchSheetPage';
import { LoginPage } from '../src/pages/LoginPage';
import { newIpad } from '../src/pages/SalesmanPages';
import { todayIST } from '../src/seed';


/**
 * The dispatcher closes the loop each day: they watch what salespeople submitted, can reopen one entry for a
 * correction and lock it again, and finally finalize the day. Finalizing locks every entry for everyone, so this
 * journey stops short of pressing it (it would lock the shared environment); it proves the button is offered.
 */
test.describe('Dispatcher', () => {
  test('locks and unlocks a salesperson\'s entry for today, and is offered Finalize Day', async ({ browser, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);
    const dispatcher = await superSeed.adminUser('dispatcher');

    const ipad = await newIpad(browser);
    try {
      const login = new LoginPage(ipad);
      await login.open();
      await login.signIn(dispatcher.username, dispatcher.password);
      await expect(ipad).toHaveURL(/\/salesman\/dispatch-sheet$/);

      const sheet = new DispatchSheetPage(ipad);
      await sheet.select(salesperson.name);
      await expect(sheet.entry(salesperson.name)).toContainText(rupees(60));
      await expect(sheet.lockedBadge).toBeVisible();

      await sheet.unlockButton.click();
      await sheet.confirmLockChange(/Unlock/);
      await expect(sheet.lockButton).toBeVisible();
      await expect(sheet.lockedBadge).toHaveCount(0);

      await sheet.lockButton.click();
      await sheet.confirmLockChange(/Lock/);
      await expect(sheet.unlockButton).toBeVisible();
      await expect(sheet.lockedBadge).toBeVisible();

      // End-of-day control belongs to the dispatcher; reverting it belongs to admins.
      await expect(ipad.getByRole('button', { name: 'Finalize Day' })).toBeVisible();
      await expect(ipad.getByRole('button', { name: 'Undo Finalization' })).toHaveCount(0);
    } finally {
      await ipad.context().close();
    }
  });
});
