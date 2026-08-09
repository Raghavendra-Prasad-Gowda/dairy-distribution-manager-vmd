/**
 * Button — soft-teal variant test.
 *
 * Added for the Deposit Top-up action (teal, distinct from the amber dues
 * top-up and the red destructive actions) — a minimal smoke test rather than
 * full Button coverage, since the rest of the component is unchanged.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Button from './Button';

describe('Button — soft-teal variant', () => {
  it('applies the teal soft-pill classes', () => {
    render(<Button variant="soft-teal">Deposit Top-up</Button>);
    const btn = screen.getByRole('button', { name: 'Deposit Top-up' });
    expect(btn.className).toContain('bg-teal-50');
    expect(btn.className).toContain('text-teal-700');
  });

  it('is visually distinct from soft-warning (the dues top-up color)', () => {
    render(
      <>
        <Button variant="soft-teal">Deposit</Button>
        <Button variant="soft-warning">Dues</Button>
      </>
    );
    const deposit = screen.getByRole('button', { name: 'Deposit' });
    const dues    = screen.getByRole('button', { name: 'Dues' });
    expect(deposit.className).not.toBe(dues.className);
  });
});
