/**
 * SalespersonStatement tests.
 *
 * Covers the salesperson header band (avatar + name + route shown when a
 * salesperson is selected) and the totals footer row (sum of Given and
 * Collected, final Due).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonStatement from './SalespersonStatement';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:       () => '2026-07-09',
  getFirstDayOfMonth: () => '2026-07-01',
  formatCurrency:     (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
}));

const SALESPEOPLE = [
  { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
];

const ROWS = [
  { date: '2026-07-08', openingBalance: 1000, stockGiven: 500, amountPaid: 300, closingBalance: 1200, items: [], payments: [] },
  { date: '2026-07-09', openingBalance: 1200, stockGiven: 400, amountPaid: 600, closingBalance: 1000, items: [], payments: [] },
];

function mockApi({ rows = ROWS } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/salesperson-statement')) return Promise.resolve({ data: { data: rows } });
    if (url.includes('/salespeople'))                   return Promise.resolve({ data: { data: SALESPEOPLE } });
    return Promise.resolve({ data: { data: [] } });
  });
}

async function selectRamesh() {
  render(<SalespersonStatement />);
  const spButton = await screen.findByText('Ramesh Kumar');
  fireEvent.click(spButton);
}

describe('SalespersonStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('prompts to select a salesperson initially', async () => {
    render(<SalespersonStatement />);
    expect(await screen.findByText('Select a salesperson')).toBeInTheDocument();
  });

  it('shows the header band with initials, name and route after selecting', async () => {
    await selectRamesh();
    // Initials avatar (first + last name)
    expect(await screen.findByText('RK')).toBeInTheDocument();
    // Name appears in sidebar and header band
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Route 3').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a totals footer row summing Given and Collected with final Due', async () => {
    await selectRamesh();
    const totalsCell = await screen.findByText('Totals');
    const row = totalsCell.closest('tr');
    expect(row.textContent).toContain('₹900.00');  // total given: 500 + 400
    expect(row.textContent).toContain('₹900.00');  // total collected: 300 + 600
    expect(row.textContent).toContain('₹1000.00'); // final due = last closing
  });

  it('does not render the totals row when there is no data', async () => {
    mockApi({ rows: [] });
    await selectRamesh();
    expect(await screen.findByText(/No data for this period/i)).toBeInTheDocument();
    expect(screen.queryByText('Totals')).not.toBeInTheDocument();
  });
});
