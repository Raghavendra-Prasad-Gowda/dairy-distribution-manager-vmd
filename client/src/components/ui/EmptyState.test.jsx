/**
 * EmptyState tests.
 *
 * Covers the default Inbox icon vs a custom one, title/description/action
 * being optional (nothing renders when omitted), and the className passthrough.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Package } from 'lucide-react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('shows the title and description when given', () => {
    render(<EmptyState title="No products yet" description="Add one to get started." />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
  });

  it('renders nothing for title/description when omitted', () => {
    const { container } = render(<EmptyState />);
    expect(container.querySelectorAll('p').length).toBe(0);
  });

  it('renders a custom action element', () => {
    render(<EmptyState title="Empty" action={<button>Add Product</button>} />);
    expect(screen.getByText('Add Product')).toBeInTheDocument();
  });

  it('uses a custom icon when given', () => {
    const { container: withCustom } = render(<EmptyState icon={Package} title="t" />);
    const { container: withDefault } = render(<EmptyState title="t" />);
    // Different lucide icon classes confirm the icon prop actually swaps the SVG.
    expect(withCustom.querySelector('svg').className.baseVal).not.toBe(withDefault.querySelector('svg').className.baseVal);
  });

  it('applies the className prop to the wrapper', () => {
    const { container } = render(<EmptyState title="t" className="my-extra-class" />);
    expect(container.firstChild.className).toContain('my-extra-class');
  });
});
