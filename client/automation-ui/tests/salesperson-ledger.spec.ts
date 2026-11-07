import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { CollectionsPage } from '../src/pages/CollectionsPage';
import { DispatchSheetPage } from '../src/pages/DispatchSheetPage';
import { DayBalancePage, OutstandingPage, StatementsPage } from '../src/pages/ReportsPages';
import { Seed, todayIST } from '../src/seed';

/**
 * What salespeople take out and what they pay back is the dairy's income. A dispatch must raise the salesperson's
 * balance, a collection must lower it, and the dispatch sheet, collections page, outstanding report, day balance and
 * statement must all show the same figures. Each test gets its own throwaway brand, product and salesperson.
 */
const world = async (seed: Seed) => {
  const brand = await seed.brand();
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.enableForSalespeople(product.id, 15); // salespeople are charged ₹15
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
  const salesperson = await seed.salesperson();
  await seed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true); // ₹60
  return { brand, product, salesperson };
};

test.describe('Salesperson ledger', () => {
  test('a submitted dispatch appears on the dispatch sheet, locked, with the right total', async ({ page, superSeed }) => {
    const { brand, product, salesperson } = await world(superSeed);

    const sheet = new DispatchSheetPage(page);
    await sheet.open();
    await sheet.select(salesperson.name);

    await expect(sheet.entry(salesperson.name)).toContainText(rupees(60));
    await expect(sheet.lockedBadge).toBeVisible();
    const brandRow = sheet.detail.getByRole('row').filter({ hasText: brand.name });
    await expect(brandRow).toContainText('4 units');
    await expect(brandRow).toContainText(rupees(60));

    await brandRow.click(); // expand the brand to see the product line
    const line = sheet.detail.getByRole('row').filter({ hasText: product.name });
    await expect(line).toContainText('4');
    await expect(line).toContainText(rupees(15)); // the salesperson's rate
    await expect(line).toContainText(rupees(60));
    await expect(sheet.detail).toContainText('Grand Total');
  });

  test('an admin can unlock a submitted entry so the salesperson can correct it, and lock it again', async ({
    page,
    superSeed,
  }) => {
    const { salesperson } = await world(superSeed);
    const sheet = new DispatchSheetPage(page);
    await sheet.open();
    await sheet.select(salesperson.name);

    await sheet.unlockButton.click();
    await sheet.confirmLockChange(/Unlock/);
    // Reloading the sheet must keep this salesperson open, not jump to whoever is first in the list.
    await expect(sheet.panelFor(salesperson.name)).toBeVisible();
    await expect(sheet.lockButton).toBeVisible();
    await expect(sheet.lockedBadge).toHaveCount(0);

    await sheet.lockButton.click();
    await sheet.confirmLockChange(/Lock/);
    await expect(sheet.unlockButton).toBeVisible();
    await expect(sheet.lockedBadge).toBeVisible();
  });

  test('a collection lowers the balance on every screen, and deleting it (with the PIN) restores it', async ({
    page,
    superSeed,
    editPin,
  }) => {
    const { salesperson } = await world(superSeed);

    const collections = new CollectionsPage(page);
    await collections.open();
    await collections.select(salesperson.name);
    await expect(collections.account).toContainText(rupees(60));

    await collections.record(25, 'UPI', 'E2E-COLL-1');
    await expect(collections.historyRow('E2E-COLL-1')).toContainText(rupees(25));
    await expect(collections.account).toContainText(rupees(35)); // 60 - 25

    const outstanding = new OutstandingPage(page);
    await outstanding.open();
    await expect(outstanding.card(salesperson.name)).toContainText(rupees(35));

    const dayBalance = new DayBalancePage(page);
    await dayBalance.open();
    const cells = (await dayBalance.cells(salesperson.name)).join(' | ');
    expect(cells).toContain(rupees(60)); // today's bill
    expect(cells).toContain(rupees(25)); // paid today
    expect(cells).toContain(rupees(35)); // total balance

    const statements = new StatementsPage(page);
    await statements.open();
    await statements.select(salesperson.name);
    await expect(statements.outstandingBadge).toHaveText(`Outstanding: ${rupees(35)}`);
    await expect(statements.totalsRow).toContainText(rupees(60)); // given
    await expect(statements.totalsRow).toContainText(rupees(25)); // collected

    await collections.open();
    await collections.select(salesperson.name);
    await collections.delete(collections.historyRow('E2E-COLL-1'), editPin);
    await expect(collections.historyRow('E2E-COLL-1')).toHaveCount(0);
    await expect(collections.account).toContainText(rupees(60));
  });

  test('paying the full amount clears the salesperson on the outstanding report', async ({ page, superSeed }) => {
    const { salesperson } = await world(superSeed);
    await superSeed.salespersonPayment(salesperson.id, 60);

    const outstanding = new OutstandingPage(page);
    await outstanding.open();
    await expect(outstanding.card(salesperson.name)).toContainText('Cleared');
    await expect(outstanding.card(salesperson.name)).not.toContainText('Outstanding');
  });
});
