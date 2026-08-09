/**
 * BalanceLedger tests.
 *
 * Covers the opening/stock/paid/balance cells, the "You Owe" vs "Settled"
 * label + tone switch, and Math.abs on the closing figure so a negative
 * (credit) balance still displays as a positive number.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BalanceLedger from './BalanceLedger';

describe('BalanceLedger', () => {
  it('shows opening, stock, and paid figures', () => {
    render(<BalanceLedger opening={500} stockValue={1000} paid={800} closing={700} />);
    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.getByText('₹500.00')).toBeInTheDocument();
    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('₹800.00')).toBeInTheDocument();
  });

  it('labels a positive closing balance "You Owe"', () => {
    render(<BalanceLedger opening={500} stockValue={1000} paid={800} closing={700} />);
    expect(screen.getByText('You Owe')).toBeInTheDocument();
    expect(screen.getByText('₹700.00')).toBeInTheDocument();
  });

  it('labels a zero-or-negative closing balance "Settled" and shows the absolute value', () => {
    render(<BalanceLedger opening={500} stockValue={800} paid={1300} closing={-200} />);
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.getByText('₹200.00')).toBeInTheDocument();
    expect(screen.queryByText('You Owe')).toBeNull();
  });
});
