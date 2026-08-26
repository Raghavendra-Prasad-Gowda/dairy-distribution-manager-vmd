/**
 * DispatchStockSummaryView tests.
 *
 * Unit-tests the shared presentational component in isolation from the
 * pages that embed it (SalespersonStatement.jsx for admin, MyStatement.jsx
 * for the salesman) and from the buildDispatchStockSummary() aggregation —
 * fixtures below are hand-built in the shape that function returns.
 *
 * Covers: loading/error/empty states, the brand header (product count,
 * per-brand color), the always-shown category header, crates/liters/kgs
 * rendering a dash when null vs a formatted number when present, and the
 * Grand Total footer.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DispatchStockSummaryView from './DispatchStockSummary';

vi.mock('./ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
  TumblerSpinner: () => <span data-testid="tumbler" />,
}));

function product(overrides) {
  return {
    productName: 'Toned Milk 500ml',
    totalQty: 10, totalValue: 445,
    totalCrates: null, totalLiters: null, totalKgs: null,
    ...overrides,
  };
}

function category(overrides) {
  return {
    categoryName: 'Milk',
    totalQty: 10, totalValue: 445,
    totalCrates: null, totalLiters: null, totalKgs: null,
    products: [product()],
    ...overrides,
  };
}

function brand(overrides) {
  return {
    brandName: 'Nandini',
    totalQty: 10, totalValue: 445,
    totalCrates: null, totalLiters: null, totalKgs: null,
    categories: [category()],
    ...overrides,
  };
}

function summary(overrides) {
  return {
    brands: [brand()],
    totalQty: 10, totalValue: 445,
    totalCrates: null, totalLiters: null, totalKgs: null,
    ...overrides,
  };
}

describe('DispatchStockSummaryView — states', () => {
  it('shows a loader while loading, before anything else', () => {
    render(<DispatchStockSummaryView summary={null} loading />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('shows an error banner instead of the table', () => {
    render(<DispatchStockSummaryView summary={summary()} error="Failed to load report" />);
    expect(screen.getByText('Failed to load report')).toBeInTheDocument();
    expect(screen.queryByText('Grand Total')).not.toBeInTheDocument();
  });

  it('shows the default empty message when there are no brands', () => {
    render(<DispatchStockSummaryView summary={summary({ brands: [] })} />);
    expect(screen.getByText('No dispatch data for this period')).toBeInTheDocument();
  });

  it('shows a custom empty message when given one', () => {
    render(<DispatchStockSummaryView summary={summary({ brands: [] })} emptyMessage="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows the empty message when summary itself is null/undefined', () => {
    render(<DispatchStockSummaryView summary={null} />);
    expect(screen.getByText('No dispatch data for this period')).toBeInTheDocument();
  });
});

describe('DispatchStockSummaryView — brand header', () => {
  it('shows the brand name, product count, and its own color', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ brandName: 'Nandini', categories: [category({ products: [product(), product({ productName: 'Curd 200g' })] })] })],
    })} />);

    const row = screen.getByText(/Nandini/).closest('tr');
    expect(within(row).getByText('2 products')).toBeInTheDocument();
    expect(row).toHaveClass('bg-nandini-700');
  });

  it('uses singular "product" for exactly one product', () => {
    render(<DispatchStockSummaryView summary={summary()} />);
    const row = screen.getByText(/Nandini/).closest('tr');
    expect(within(row).getByText('1 product')).toBeInTheDocument();
  });

  it('colors an unknown brand from the fallback palette by its position', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ brandName: 'Heritage' })],
    })} />);
    expect(screen.getByText(/Heritage/).closest('tr')).toHaveClass('bg-rose-700');
  });

  it('shows a dash for crates/liters/kgs when the brand total is null, a number when present', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ totalCrates: null, totalLiters: 12.5, totalKgs: null })],
    })} />);
    const row = screen.getByText(/Nandini/).closest('tr');
    expect(within(row).getAllByText('—')).toHaveLength(2); // crates, kgs
    expect(within(row).getByText('12.50')).toBeInTheDocument();
  });
});

describe('DispatchStockSummaryView — category header', () => {
  it('always shows the category header, even for a brand with just one category', () => {
    render(<DispatchStockSummaryView summary={summary()} />);
    const categoryRow = screen.getByText('Milk').closest('tr');
    expect(categoryRow).toHaveClass('bg-slate-100');
    expect(categoryRow.querySelector('td')).toHaveClass('text-left', 'text-slate-700');
  });

  it('groups a null/"Uncategorized" category the same way, still shown', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [category({ categoryName: 'Uncategorized' })] })],
    })} />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('renders a header per category when a brand has multiple', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [
        category({ categoryName: 'Milk' }),
        category({ categoryName: 'Curd', products: [product({ productName: 'Curd 200g' })] }),
      ] })],
    })} />);
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
  });
});

describe('DispatchStockSummaryView — product rows', () => {
  it('shows the product name and formatted quantity/amount', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [category({ products: [product({ productName: 'Toned Milk 500ml', totalQty: 15, totalValue: 667.5 })] })] })],
    })} />);
    const row = screen.getByText('Toned Milk 500ml').closest('tr');
    expect(within(row).getByText('15')).toBeInTheDocument();
    expect(within(row).getByText('₹667.50')).toBeInTheDocument();
  });

  it('shows a dash for null crates/liters/kgs on a product row', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [category({ products: [product({ totalCrates: null, totalLiters: null, totalKgs: null })] })] })],
    })} />);
    const row = screen.getByText('Toned Milk 500ml').closest('tr');
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });

  it('shows whole-number crates/quantity/liters plain, with no decimals', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [category({ products: [
        product({ productName: 'Crate Product', totalQty: 24, totalCrates: 10, totalLiters: 12, totalKgs: null }),
      ] })] })],
    })} />);
    const row = screen.getByText('Crate Product').closest('tr');
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(within(row).getByText('24')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
  });

  it('shows fractional crates/liters/kgs to 2 decimal places', () => {
    render(<DispatchStockSummaryView summary={summary({
      brands: [brand({ categories: [category({ products: [
        product({ productName: 'Fractional Product', totalCrates: 3.33, totalLiters: 18.5, totalKgs: 7.1 }),
      ] })] })],
    })} />);
    const row = screen.getByText('Fractional Product').closest('tr');
    expect(within(row).getByText('3.33')).toBeInTheDocument();
    expect(within(row).getByText('18.50')).toBeInTheDocument();
    expect(within(row).getByText('7.10')).toBeInTheDocument();
  });
});

describe('DispatchStockSummaryView — grand total footer', () => {
  it('shows the overall totals, with dashes for null crates/liters/kgs', () => {
    render(<DispatchStockSummaryView summary={summary({
      totalQty: 384, totalValue: 9468, totalCrates: null, totalLiters: null, totalKgs: null,
    })} />);
    const row = screen.getByText('Grand Total').closest('tr');
    expect(within(row).getByText('384')).toBeInTheDocument();
    expect(within(row).getByText('₹9,468.00')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });

  it('shows numeric crates/liters/kgs when present', () => {
    render(<DispatchStockSummaryView summary={summary({
      totalQty: 20, totalValue: 900, totalCrates: 2, totalLiters: 10, totalKgs: 5,
    })} />);
    const row = screen.getByText('Grand Total').closest('tr');
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
  });
});
