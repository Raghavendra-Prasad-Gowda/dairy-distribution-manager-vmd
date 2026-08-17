import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PriceEditModal from './PriceEditModal';

const fmt = v => (v > 0 ? `₹${Number(v).toFixed(2)}` : '—');

function baseProps(overrides = {}) {
  return {
    editingPrice: {
      productId: 1, productName: 'Toned Milk', brandName: 'Nandini', category: 'Milk',
      currentPrice: 45, currentEffective: '2026-01-01',
      dairyCostPrice: 40, dairySellingPrice: 44,
      unitType: 'ml', unitSize: 500,
    },
    priceForm: { sellingPrice: '45', effectiveFrom: '2026-08-17' },
    setPriceForm: vi.fn(),
    savingPrice: false,
    onClose: vi.fn(),
    onSubmit: vi.fn(e => e.preventDefault()),
    onShowHistory: vi.fn(),
    fmt,
    ...overrides,
  };
}

describe('PriceEditModal', () => {
  it('renders nothing when there is no product being edited', () => {
    const { container } = render(<PriceEditModal {...baseProps({ editingPrice: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the product name, brand/category badges, and read-only price figures', () => {
    render(<PriceEditModal {...baseProps()} />);
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('₹40.00')).toBeInTheDocument(); // dairy cost
    expect(screen.getByText('₹44.00')).toBeInTheDocument(); // dairy selling
    expect(screen.getByText('₹45.00')).toBeInTheDocument(); // current price
    expect(screen.getByText(/since 1 Jan 2026/)).toBeInTheDocument();
  });

  it('omits the brand/category badges and the current-price block when absent', () => {
    render(<PriceEditModal {...baseProps({
      editingPrice: { productId: 1, productName: 'No Brand Product', unitType: 'gram', unitSize: 250 },
    })} />);
    expect(screen.queryByText('Current Price')).not.toBeInTheDocument();
    expect(screen.getByText('250 g')).toBeInTheDocument();
  });

  it('shows the upcoming-price banner only when a scheduled price exists', () => {
    const { rerender } = render(<PriceEditModal {...baseProps()} />);
    expect(screen.queryByText(/Upcoming/)).not.toBeInTheDocument();

    rerender(<PriceEditModal {...baseProps({
      editingPrice: {
        ...baseProps().editingPrice,
        upcomingPrice: 50, upcomingEffective: '2026-09-01',
      },
    })} />);
    expect(screen.getByText(/Upcoming · saving will replace this/)).toBeInTheDocument();
    expect(screen.getByText('₹50.00')).toBeInTheDocument();
    expect(screen.getByText(/from 1 Sep 2026/)).toBeInTheDocument();
  });

  it('derives the unit label for ml, gram, and unitless products', () => {
    const { rerender } = render(<PriceEditModal {...baseProps({
      editingPrice: { productId: 1, productName: 'P', unitType: 'ml', unitSize: 500 },
    })} />);
    expect(screen.getByText('500 ml')).toBeInTheDocument();

    rerender(<PriceEditModal {...baseProps({
      editingPrice: { productId: 1, productName: 'P', unitType: 'gram', unitSize: 250 },
    })} />);
    expect(screen.getByText('250 g')).toBeInTheDocument();

    rerender(<PriceEditModal {...baseProps({
      editingPrice: { productId: 1, productName: 'P', unitType: 'piece' },
    })} />);
    expect(screen.getByText('piece')).toBeInTheDocument();
  });

  it('shows the pack label only when both containerType and unitsPerContainer are present', () => {
    render(<PriceEditModal {...baseProps({
      editingPrice: {
        productId: 1, productName: 'Crate Product', unitType: 'ml', unitSize: 500,
        containerType: 'crate', unitsPerContainer: 24,
      },
    })} />);
    expect(screen.getByText('24 / crate')).toBeInTheDocument();
  });

  it('editing the price field round-trips through setPriceForm back into the input', () => {
    // A real, stateful setPriceForm so the controlled <input> actually
    // reflects the update — asserting on the captured updater function
    // directly is unreliable here since React resets the DOM value on
    // every re-render for a controlled input.
    function Wrapper() {
      const [priceForm, setPriceForm] = React.useState({ sellingPrice: '45', effectiveFrom: '2026-08-17' });
      return <PriceEditModal {...baseProps({ priceForm, setPriceForm })} />;
    }
    render(<Wrapper />);

    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '48.5' } });
    expect(input.value).toBe('48.5');
  });

  it('History button calls onShowHistory without closing the modal', () => {
    const onShowHistory = vi.fn();
    const onClose = vi.fn();
    render(<PriceEditModal {...baseProps({ onShowHistory, onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(onShowHistory).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel button, the X button, and the backdrop all call onClose', () => {
    const onClose = vi.fn();
    const { container } = render(<PriceEditModal {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('submitting the form calls onSubmit', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    render(<PriceEditModal {...baseProps({ onSubmit })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Price' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the save button and shows "Saving…" while savingPrice is true', () => {
    render(<PriceEditModal {...baseProps({ savingPrice: true })} />);
    expect(screen.getByRole('button', { name: /Saving…/ })).toBeDisabled();
  });
});
