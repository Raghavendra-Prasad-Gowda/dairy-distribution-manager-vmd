import { expect, test } from '../../src/fixtures';
import { rupees } from '../../src/pages/DashboardPage';
import { SalesmanStatementPage, signInAsSalesman } from '../../src/pages/SalesmanPages';
import { todayIST } from '../../src/seed';

/**
 * A salesman checks his own account over any period. Narrowing the period narrows what was billed and paid, but what
 * he owes now is the running balance and must not change with the dates he is looking at.
 */
test.describe('Salesman statement by date range (phone)', () => {
  test('narrowing the dates changes billed and paid, not what is owed', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    const salesperson = await superSeed.salesperson(true);
    // Yesterday 4 x ₹15 = ₹60, today 2 x ₹15 = ₹30, and ₹20 paid today: billed ₹90, paid ₹20, owed ₹70.
    await superSeed.dispatch(salesperson.id, todayIST(-1), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 2, unitPrice: 15 }], true);
    await superSeed.salespersonPayment(salesperson.id, 20);

    await signInAsSalesman(page, salesperson.username!, salesperson.password!);
    const statement = new SalesmanStatementPage(page);
    await statement.open();

    await statement.setFrom(todayIST(-1));
    await expect(statement.billed).toHaveText(rupees(90));
    await expect(statement.paid).toHaveText(rupees(20));
    await expect(statement.owed).toHaveText(rupees(70));

    await statement.setFrom(todayIST());
    await expect(statement.billed).toHaveText(rupees(30)); // yesterday's ₹60 is out of the period
    await expect(statement.paid).toHaveText(rupees(20));
    await expect(statement.owed).toHaveText(rupees(70)); // still owes the same
  });
});
