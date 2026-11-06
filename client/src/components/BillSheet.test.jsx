/**
 * BillSheet tests — the on-screen/print bill pad layout, shared between the
 * full print page and the Bills tab's preview dialog. Covers the masthead,
 * Bill No/PO/M-s fields, Brand → Product line items, and the total/in-words
 * footer. The shared PDF (utils/billPdf.js) is drawn independently as
 * native vector text, not by capturing this component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BillSheet from './BillSheet';

const BILL = {
  billNumber: 799,
  poNumber: '798',
  partyName: 'A.T & S',
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  totalAmount: 299854,
  lines: [
    {
      brandName: 'Nandini',
      products: [
        { productName: 'Toned Milk 500ml', unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 },
        { productName: 'Curd 500ml',       unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 },
      ],
      amount: 299854,
    },
  ],
};

describe('BillSheet', () => {
  it('renders the dairy masthead', () => {
    render(<BillSheet bill={BILL} />);
    expect(screen.getByText('VIKAS MILK DAIRY')).toBeInTheDocument();
    expect(screen.getByText('1 Test Road, Sample Town - 000 000')).toBeInTheDocument();
    expect(screen.getByText('Pro: TEST PROPRIETOR')).toBeInTheDocument();
    expect(screen.getByText('Cash / Credit Bill')).toBeInTheDocument();
  });

  it('renders the bill number, PO number and M/s', () => {
    render(<BillSheet bill={BILL} />);
    expect(screen.getByText('799')).toBeInTheDocument();
    expect(screen.getByText('798')).toBeInTheDocument();
    expect(screen.getByText('A.T & S')).toBeInTheDocument();
  });

  it('renders each product under its brand, with rate/qty/amount', () => {
    render(<BillSheet bill={BILL} />);
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk 500ml')).toBeInTheDocument();
    expect(screen.getByText('52/ltr')).toBeInTheDocument();
    expect(screen.getByText('3325 ltr')).toBeInTheDocument();
    expect(screen.getByText('1,72,900.00')).toBeInTheDocument();
  });

  it('lists a second brand as its own section', () => {
    const bill = {
      ...BILL,
      lines: [
        ...BILL.lines,
        { brandName: 'Jersey', products: [{ productName: 'HTM 1L', unit: 'ltr', quantity: 10, rate: 45, amount: 450 }], amount: 450 },
      ],
    };
    render(<BillSheet bill={bill} />);
    expect(screen.getByText('Jersey')).toBeInTheDocument();
    expect(screen.getByText('HTM 1L')).toBeInTheDocument();
  });

  it('renders the total and the amount in words', () => {
    render(<BillSheet bill={BILL} />);
    expect(screen.getByText('2,99,854.00')).toBeInTheDocument();
    expect(
      screen.getByText('Two Lakh Ninety Nine Thousand Eight Hundred Fifty Four Rupees Only')
    ).toBeInTheDocument();
  });

  it('leaves M/s blank-safe when there is no PO number', () => {
    render(<BillSheet bill={{ ...BILL, poNumber: null }} />);
    expect(screen.getByText('A.T & S')).toBeInTheDocument();
    expect(screen.queryByText('798')).not.toBeInTheDocument();
  });
});
