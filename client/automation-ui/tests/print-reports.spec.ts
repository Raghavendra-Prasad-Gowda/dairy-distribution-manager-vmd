import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { PrintSheetPage } from '../src/pages/PrintSheetPage';
import { todayIST } from '../src/seed';

/**
 * The printable sheets (/print/*) open in their own window from the report screens and hand the browser's print
 * dialog the figures on paper. The dialog itself cannot be asserted, so `window.print` is counted instead and the
 * sheet's content is checked: title, who it is for, and totals built from what was seeded.
 */
test.describe('Printable report sheets', () => {
  test('the dairy statement sheet shows the brand, the totals and offers to print', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 10, unitPrice: 10 }]);
    await superSeed.dairyPayment(brand.id, 30, todayIST());

    const sheet = new PrintSheetPage(page);
    await sheet.stubPrint();
    await sheet.open(`/print/dairy-statement?brandId=${brand.id}&from=${todayIST()}&to=${todayIST()}`);
    await expect(sheet.title('Dairy Statement')).toBeVisible();
    await expect(sheet.text(brand.name)).toBeVisible();
    await expect(sheet.total('Total Bill:')).toContainText(rupees(100));
    await expect(sheet.total('Total Paid:')).toContainText(rupees(30));
    await expect(sheet.total('Closing Balance:')).toContainText(rupees(70));
    await expect(sheet.printButton).toBeVisible();
    await expect.poll(() => sheet.printRequests()).toBeGreaterThan(0);
  });

  test('the stock summary sheet lists what was received for the chosen brand', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 10, unitPrice: 10 }]);

    const sheet = new PrintSheetPage(page);
    await sheet.stubPrint();
    await sheet.open(`/print/stock-summary?from=${todayIST()}&to=${todayIST()}&brandId=${brand.id}`);
    await expect(sheet.text(product.name)).toBeVisible();
    await expect(sheet.text(rupees(100))).toBeVisible();
    await expect(sheet.printButton).toBeVisible();
    await expect.poll(() => sheet.printRequests()).toBeGreaterThan(0);
  });

  test('the deposit sheet names the brand and the period', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();

    const sheet = new PrintSheetPage(page);
    await sheet.stubPrint();
    await sheet.open(`/print/deposit?brandId=${brand.id}&from=${todayIST()}&to=${todayIST()}`);
    await expect(sheet.title('Deposit Report')).toBeVisible();
    await expect(sheet.text(brand.name)).toBeVisible();
    await expect(sheet.text(todayIST())).toBeVisible();
    await expect(sheet.printButton).toBeVisible();
  });

  test('the salesperson statement sheet shows the salesperson and what was billed, in both views', async ({
    page,
    superSeed,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);
    await superSeed.salespersonPayment(salesperson.id, 20);

    const sheet = new PrintSheetPage(page);
    await sheet.stubPrint();
    const base = `/print/salesperson-statement?salespersonId=${salesperson.id}&from=${todayIST()}&to=${todayIST()}`;
    await sheet.open(base);
    await expect(sheet.title('Salesperson Statement')).toBeVisible();
    await expect(sheet.text(salesperson.name)).toBeVisible();
    await expect(sheet.text(rupees(60))).toBeVisible(); // 4 x ₹15 billed
    await expect(sheet.text(rupees(20))).toBeVisible(); // collected
    await expect(sheet.text(rupees(40))).toBeVisible(); // closing balance

    await sheet.open(`${base}&type=dispatch`);
    await expect(sheet.title('Dispatch Stock Summary')).toBeVisible();
    await expect(sheet.text(product.name)).toBeVisible();
    await expect(sheet.text(rupees(60))).toBeVisible();
  });
});
