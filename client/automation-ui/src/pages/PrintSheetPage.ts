import { type Locator, type Page } from '@playwright/test';

/**
 * The printable sheets under /print/*. They open in their own window and call `window.print()` once their data is in;
 * `stubPrint` swaps that for a counter so the dialog never opens and the test can still tell the sheet asked to print.
 */
export class PrintSheetPage {
  readonly printButton: Locator;

  constructor(private readonly page: Page) {
    this.printButton = page.getByRole('button', { name: 'Print / Save PDF' });
  }

  /** Call before opening a sheet. */
  async stubPrint(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __prints: number };
      w.__prints = 0;
      window.print = () => {
        w.__prints += 1;
      };
    });
  }

  async open(path: string): Promise<void> {
    await this.page.goto(path);
  }

  printRequests(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __prints: number }).__prints);
  }

  /** The sheet's title line, e.g. "Dairy Statement". */
  title(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** Any text on the sheet (name, product, amount). */
  text(text: string): Locator {
    return this.page.getByText(text).first();
  }

  /** A header total such as "Total Bill:" together with its amount. */
  total(label: string): Locator {
    return this.page.getByText(label);
  }
}
