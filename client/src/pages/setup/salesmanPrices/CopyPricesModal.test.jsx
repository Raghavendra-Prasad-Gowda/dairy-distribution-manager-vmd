import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CopyPricesModal from './CopyPricesModal';

const SALESPEOPLE = [
  { id: 1, name: 'Ramu', route: 'North Zone' },
  { id: 2, name: 'Suresh', route: 'South Zone' },
  { id: 3, name: 'Kumar', route: null },
];

const BRANDS = [{ id: 10, name: 'Nandini' }, { id: 20, name: 'Jersey' }];

function baseProps(overrides = {}) {
  return {
    show: true,
    salespeople: SALESPEOPLE,
    selectedSpId: '1', // Ramu is the one we're copying INTO — excluded from candidates
    activeBrandId: 10,
    brands: BRANDS,
    copyFromSpId: '',
    setCopyFromSpId: vi.fn(),
    copyPricesSearch: '',
    setCopyPricesSearch: vi.fn(),
    copyingPrices: false,
    onClose: vi.fn(),
    onCopy: vi.fn(),
    ...overrides,
  };
}

describe('CopyPricesModal', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<CopyPricesModal {...baseProps({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every salesperson except the one currently selected', () => {
    render(<CopyPricesModal {...baseProps()} />);
    expect(screen.queryByText('Ramu')).not.toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.getByText('Kumar')).toBeInTheDocument();
    expect(screen.getByText('South Zone')).toBeInTheDocument();
  });

  it('omits the route line for a salesperson with no route', () => {
    render(<CopyPricesModal {...baseProps()} />);
    const kumarRow = screen.getByText('Kumar').closest('button');
    expect(kumarRow.querySelector('.text-xs.text-slate-500')).toBeNull();
  });

  it('filters candidates by name or route as the search box changes', () => {
    render(<CopyPricesModal {...baseProps({ copyPricesSearch: 'south' })} />);
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.queryByText('Kumar')).not.toBeInTheDocument();
  });

  it('shows "No other salespeople" when there are no candidates and no search', () => {
    render(<CopyPricesModal {...baseProps({ salespeople: [SALESPEOPLE[0]] })} />);
    expect(screen.getByText('No other salespeople')).toBeInTheDocument();
  });

  it('shows "No salespeople found" when a search yields nothing', () => {
    render(<CopyPricesModal {...baseProps({ copyPricesSearch: 'zzz' })} />);
    expect(screen.getByText('No salespeople found')).toBeInTheDocument();
  });

  it('selecting a candidate sets copyFromSpId and clears the search box', () => {
    const setCopyFromSpId = vi.fn();
    const setCopyPricesSearch = vi.fn();
    render(<CopyPricesModal {...baseProps({ setCopyFromSpId, setCopyPricesSearch })} />);

    fireEvent.click(screen.getByText('Suresh'));

    expect(setCopyFromSpId).toHaveBeenCalledWith('2');
    expect(setCopyPricesSearch).toHaveBeenCalledWith('');
  });

  it('highlights the currently selected candidate', () => {
    render(<CopyPricesModal {...baseProps({ copyFromSpId: '2' })} />);
    const suresh = screen.getByText('Suresh').closest('button');
    expect(suresh.className).toContain('bg-emerald-100');
  });

  it('names the active brand in the copy notice, falling back when no match', () => {
    const { rerender } = render(<CopyPricesModal {...baseProps({ activeBrandId: 10 })} />);
    expect(screen.getByText(/Nandini will be copied/)).toBeInTheDocument();

    rerender(<CopyPricesModal {...baseProps({ activeBrandId: 999 })} />);
    expect(screen.getByText(/this brand will be copied/)).toBeInTheDocument();
  });

  it('Cancel button and backdrop click both call onClose', () => {
    const onClose = vi.fn();
    const { container } = render(<CopyPricesModal {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('clicking inside the modal card does not close it (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<CopyPricesModal {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByText('Copy Prices', { selector: 'h3' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Copy Prices button is disabled with no selection, calls onCopy once one is picked', () => {
    const onCopy = vi.fn();
    const { rerender } = render(<CopyPricesModal {...baseProps({ copyFromSpId: '', onCopy })} />);
    expect(screen.getByRole('button', { name: /Copy Prices/ })).toBeDisabled();

    rerender(<CopyPricesModal {...baseProps({ copyFromSpId: '2', onCopy })} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Prices/ }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state and disables the button while copyingPrices is true', () => {
    render(<CopyPricesModal {...baseProps({ copyFromSpId: '2', copyingPrices: true })} />);
    expect(screen.getByRole('button', { name: /Copying…/ })).toBeDisabled();
  });
});
