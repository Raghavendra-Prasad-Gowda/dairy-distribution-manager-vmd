/**
 * BrandTabs tests.
 *
 * BrandTabs itself does no sorting — every page that uses it (Stock Receipt,
 * the salesman pricing tab, Layout Settings) relies on it rendering the
 * `brands` array in exactly the order it was given, since ordering is
 * decided upstream (the `/brands` API, sorted by displayOrder). This guards
 * against a future refactor accidentally re-sorting, deduping, or filtering
 * inside the component itself, which would silently desync every page that
 * depends on brand tab order.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BrandTabs from './BrandTabs';

const BRANDS = [
  { id: 2, name: 'Jersey' },
  { id: 1, name: 'Nandini' },
  { id: 3, name: 'Gowardhan' },
];

describe('BrandTabs — order', () => {
  it('renders tabs in exactly the order the brands array was given, not re-sorted', () => {
    render(<BrandTabs brands={BRANDS} activeBrandId={1} onChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent.trim())).toEqual(['Jersey', 'Nandini', 'Gowardhan']);
  });

  it('renders every brand passed in, without dropping or deduping any', () => {
    render(<BrandTabs brands={BRANDS} activeBrandId={1} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(BRANDS.length);
  });

  it('highlights only the active brand', () => {
    render(<BrandTabs brands={BRANDS} activeBrandId={1} onChange={vi.fn()} />);
    const nandini = screen.getByText('Nandini').closest('button');
    const jersey  = screen.getByText('Jersey').closest('button');
    expect(nandini.className).not.toBe(jersey.className);
  });
});
