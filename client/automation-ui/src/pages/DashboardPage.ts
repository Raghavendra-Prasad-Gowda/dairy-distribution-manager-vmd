import { type Locator, type Page } from '@playwright/test';

export class DashboardPage {
  readonly heading: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard', exact: true }).first();
  }
}
