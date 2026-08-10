/**
 * StatusBadge tests.
 *
 * Covers the three status labels (cleared/outstanding/partial), the
 * unrecognized-status fallback to "outstanding", and amount overriding the
 * label text when given.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge — labels', () => {
  it('shows "Cleared" in emerald for status=cleared', () => {
    render(<StatusBadge status="cleared" />);
    const badge = screen.getByText('Cleared');
    expect(badge.className).toContain('bg-emerald-100');
  });

  it('shows "Owing" in red for status=outstanding', () => {
    render(<StatusBadge status="outstanding" />);
    const badge = screen.getByText('Owing');
    expect(badge.className).toContain('bg-red-100');
  });

  it('shows "Partial" in amber for status=partial', () => {
    render(<StatusBadge status="partial" />);
    const badge = screen.getByText('Partial');
    expect(badge.className).toContain('bg-amber-100');
  });

  it('falls back to the outstanding style for an unrecognized status', () => {
    render(<StatusBadge status="mystery" />);
    const badge = screen.getByText('Owing');
    expect(badge.className).toContain('bg-red-100');
  });
});

describe('StatusBadge — amount', () => {
  it('shows the formatted amount instead of the label when given', () => {
    render(<StatusBadge status="cleared" amount={1500} />);
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
    expect(screen.queryByText('Cleared')).toBeNull();
  });

  it('shows ₹0.00 (not the label) when amount is exactly 0', () => {
    render(<StatusBadge status="cleared" amount={0} />);
    expect(screen.getByText('₹0.00')).toBeInTheDocument();
  });
});
