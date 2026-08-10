/**
 * BrandedLoader tests.
 *
 * Covers inline mode (default), the three overlay tones (card/brand/
 * transparent), overlay+open=false rendering nothing, hideBrand, custom
 * label text, and the size prop affecting the ring wrapper class.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BrandedLoader from './BrandedLoader';

describe('BrandedLoader — inline mode', () => {
  it('renders centered in its container with the brand name and default label', () => {
    const { container } = render(<BrandedLoader />);
    expect(screen.getByText('Vikas Milk Dairy')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    // Inline mode is not fixed-position.
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('hides the brand name when hideBrand is set', () => {
    render(<BrandedLoader hideBrand />);
    expect(screen.queryByText('Vikas Milk Dairy')).toBeNull();
  });

  it('shows a custom label', () => {
    render(<BrandedLoader label="Fetching report…" />);
    expect(screen.getByText('Fetching report…')).toBeInTheDocument();
  });

  it('renders no label paragraph when label is empty', () => {
    const { container } = render(<BrandedLoader label="" hideBrand />);
    expect(container.querySelectorAll('p').length).toBe(0);
  });
});

describe('BrandedLoader — overlay mode', () => {
  it('renders nothing when overlay is open=false', () => {
    const { container } = render(<BrandedLoader overlay open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('default (card) tone renders a fixed, full-screen white card', () => {
    const { container } = render(<BrandedLoader overlay />);
    const root = container.querySelector('.fixed.inset-0');
    expect(root).toBeInTheDocument();
    expect(container.querySelector('.bg-white.rounded-3xl')).toBeInTheDocument();
  });

  it('tone="brand" renders the emerald gradient background', () => {
    const { container } = render(<BrandedLoader overlay tone="brand" />);
    expect(container.querySelector('.bg-gradient-to-b')).toBeInTheDocument();
  });

  it('tone="transparent" renders a dim backdrop with no white card', () => {
    const { container } = render(<BrandedLoader overlay tone="transparent" />);
    expect(container.querySelector('.bg-black\\/50')).toBeInTheDocument();
    expect(container.querySelector('.bg-white.rounded-3xl')).toBeNull();
  });
});

describe('BrandedLoader — size', () => {
  it('uses a smaller ring wrapper for size="sm"', () => {
    const { container } = render(<BrandedLoader size="sm" />);
    expect(container.querySelector('.w-20.h-20')).toBeInTheDocument();
  });

  it('uses the medium ring wrapper by default', () => {
    const { container } = render(<BrandedLoader />);
    expect(container.querySelector('.w-32.h-32')).toBeInTheDocument();
  });
});
