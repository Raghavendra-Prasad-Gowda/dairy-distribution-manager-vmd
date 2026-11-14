import { expect, test } from '../../src/fixtures';
import { rupees } from '../../src/pages/DashboardPage';
import { PrintSheetPage } from '../../src/pages/PrintSheetPage';
import { signInAsSalesman } from '../../src/pages/SalesmanPages';
import { todayIST } from '../../src/seed';

/** A salesman prints his own statement (the sheet opened from My Statement); the paper carries his figures only. */
test.describe('Salesman printable statement (phone)', () => {
  test('shows his own billed and paid totals in both views', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    const salesperson = await superSeed.salesperson(true);
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);
    await superSeed.salespersonPayment(salesperson.id, 20);

    const sheet = new PrintSheetPage(page);
    await sheet.stubPrint();
    await signInAsSalesman(page, salesperson.username!, salesperson.password!);

    const range = `from=${todayIST()}&to=${todayIST()}`;
    await sheet.open(`/print/salesman-my-statement?${range}`);
    await expect(sheet.title('My Account Statement')).toBeVisible();
    await expect(sheet.total('Total Billed:')).toContainText(rupees(60));
    await expect(sheet.total('Total Paid:')).toContainText(rupees(20));

    await sheet.open(`/print/salesman-my-statement?${range}&type=dispatch`);
    await expect(sheet.title('My Dispatch Stock Summary')).toBeVisible();
    await expect(sheet.text(product.name)).toBeVisible();
  });
});
