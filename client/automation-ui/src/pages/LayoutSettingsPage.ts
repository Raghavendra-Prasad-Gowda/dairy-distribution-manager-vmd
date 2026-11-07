import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** /dairy/setup/layout — the order categories appear in, for every screen that lists a brand's products. */
export class LayoutSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(brandName: string): Promise<void> {
    await this.page.goto('/dairy/setup/layout');
    await this.page.getByRole('heading', { name: 'Layout Settings' }).waitFor();
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.getByText('Loading…')).toHaveCount(0);
  }

  private categoryRow(name: string): Locator {
    return this.page.locator('div.cursor-pointer').filter({ hasText: name });
  }

  /** Category names from top to bottom. */
  async categoryOrder(): Promise<string[]> {
    return this.page.locator('div.cursor-pointer span.flex-1').allInnerTexts();
  }

  async moveUp(categoryName: string): Promise<void> {
    await this.categoryRow(categoryName).getByRole('button').first().click();
  }

  async save(): Promise<void> {
    const saved = this.page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/products\/reorder$/.test(new URL(r.url()).pathname),
    );
    await this.page.getByRole('button', { name: 'Save Layout' }).click();
    await saved;
    await this.acknowledgeNotice('Layout saved successfully!');
  }
}
