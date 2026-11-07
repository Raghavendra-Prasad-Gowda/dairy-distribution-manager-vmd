import { expect, test } from '../src/fixtures';
import { CollectionsPage } from '../src/pages/CollectionsPage';
import { DairyPaymentsPage } from '../src/pages/DairyPaymentsPage';
import { rupees } from '../src/pages/DashboardPage';
import { Seed, todayIST } from '../src/seed';

/**
 * Payments are corrected and looked up long after they are recorded: a wrong amount or mode is edited (behind the edit
 * PIN), and a long history is searched, filtered and paged. Each test uses its own throwaway brand / salesperson.
 */
const dairyWorld = async (seed: Seed) => {
  const brand = await seed.brand();
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]); // owe ₹1000
  return { brand };
};

test.describe('Dairy payment history', () => {
  test('editing a payment (after the PIN) changes its amount and mode and the balance follows', async ({
    page,
    superSeed,
    editPin,
  }) => {
    const { brand } = await dairyWorld(superSeed);
    await superSeed.dairyPayment(brand.id, 100, todayIST(), 'Cash', 'E2E-EDIT-1');

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);
    await expect(payments.youOwe).toHaveText(rupees(900));

    await payments.openEdit(payments.historyRow('E2E-EDIT-1'), editPin);
    await payments.saveEdit({ amount: 250, mode: 'UPI', reference: 'E2E-EDIT-2' });

    const row = payments.historyRow('E2E-EDIT-2');
    await expect(row).toContainText(rupees(250));
    await expect(row).toContainText('UPI');
    await expect(payments.youOwe).toHaveText(rupees(750));

    await page.reload();
    await expect(payments.historyRow('E2E-EDIT-2')).toContainText(rupees(250));
    await expect(payments.youOwe).toHaveText(rupees(750));
  });

  test('a wrong PIN never opens the edit form, and cancelling the edit changes nothing', async ({
    page,
    superSeed,
    editPin,
  }) => {
    const { brand } = await dairyWorld(superSeed);
    await superSeed.dairyPayment(brand.id, 100, todayIST(), 'Cash', 'E2E-KEEP');

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);

    await payments.historyRow('E2E-KEEP').getByRole('button', { name: 'Edit' }).click();
    await payments.pin.expectOpen();
    await payments.pin.submit('000000');
    await expect(payments.pin.wrongPinMessage).toBeVisible();
    await expect(payments.editForm).toHaveCount(0);
    await page.reload(); // a wrong PIN leaves the prompt open; start clean

    await payments.openEdit(payments.historyRow('E2E-KEEP'), editPin);
    await payments.editForm.getByRole('spinbutton').fill('999');
    await payments.editForm.getByRole('button', { name: 'Cancel' }).click();
    await expect(payments.editForm).toHaveCount(0);
    await expect(payments.historyRow('E2E-KEEP')).toContainText(rupees(100));
    await expect(payments.youOwe).toHaveText(rupees(900));
  });

  test('history can be searched, filtered by mode and reference, and cleared', async ({ page, superSeed }) => {
    const { brand } = await dairyWorld(superSeed);
    await superSeed.dairyPayment(brand.id, 10, todayIST(), 'Cash', 'E2E-ALPHA');
    await superSeed.dairyPayment(brand.id, 20, todayIST(), 'UPI', 'E2E-BRAVO');
    await superSeed.dairyPayment(brand.id, 30, todayIST(), 'Cheque', 'E2E-CHARLIE');

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);
    await expect(payments.historyRows).toHaveCount(3);

    await payments.searchBox.fill('BRAVO');
    await expect(payments.historyRows).toHaveCount(1);
    await expect(payments.historyRow('E2E-BRAVO')).toBeVisible();
    await payments.searchBox.fill('nothing-like-this');
    await expect(payments.noMatch).toBeVisible();
    await payments.searchBox.fill('');
    await expect(payments.historyRows).toHaveCount(3);

    await payments.openFilters();
    await payments.filterByMode('Cheque');
    await expect(payments.historyRows).toHaveCount(1);
    await expect(payments.historyRow('E2E-CHARLIE')).toBeVisible();

    await payments.clearFilters();
    await expect(payments.historyRows).toHaveCount(3);

    await payments.filterByReference('ALPHA');
    await expect(payments.historyRows).toHaveCount(1);
    await expect(payments.historyRow('E2E-ALPHA')).toBeVisible();
  });

  test('a long history is paged fifteen at a time', async ({ page, superSeed }) => {
    const { brand } = await dairyWorld(superSeed);
    for (let i = 1; i <= 16; i++) await superSeed.dairyPayment(brand.id, i, todayIST(), 'Cash', `E2E-PG-${i}`);

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);
    await expect(payments.historyRows).toHaveCount(15);
    await expect(payments.pageIndicator).toHaveText('1 / 2');

    await payments.nextPage();
    await expect(payments.historyRows).toHaveCount(1);
    await expect(payments.pageIndicator).toHaveText('2 / 2');

    await payments.previousPage();
    await expect(payments.historyRows).toHaveCount(15);
  });
});

test.describe('Collection history', () => {
  test('editing a collection (after the PIN) changes its amount and mode and the balance follows', async ({
    page,
    superSeed,
    editPin,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true); // ₹60
    await superSeed.salespersonPayment(salesperson.id, 20, todayIST(), 'Cash', 'E2E-COLL-A');

    const collections = new CollectionsPage(page);
    await collections.open();
    await collections.select(salesperson.name);
    await expect(collections.account).toContainText(rupees(40)); // 60 - 20

    await collections.openEdit(collections.historyRow('E2E-COLL-A'), editPin);
    await collections.saveEdit({ amount: 50, mode: 'UPI', reference: 'E2E-COLL-B' });

    await expect(collections.historyRow('E2E-COLL-B')).toContainText(rupees(50));
    await expect(collections.historyRow('E2E-COLL-B')).toContainText('UPI');
    await expect(collections.account).toContainText(rupees(10)); // 60 - 50

    await collections.open();
    await collections.select(salesperson.name);
    await expect(collections.historyRow('E2E-COLL-B')).toContainText(rupees(50));
    await expect(collections.account).toContainText(rupees(10));
  });
});
