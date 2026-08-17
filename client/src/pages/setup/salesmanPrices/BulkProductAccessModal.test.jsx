import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BulkProductAccessModal from './BulkProductAccessModal';

const SALESPEOPLE = [{ id: 1, name: 'Ramu' }, { id: 2, name: 'Suresh' }];
const PRODUCTS = [
  { productId: 10, productName: 'Toned Milk', brandId: 1, category: 'Milk', categoryDisplayOrder: 1, displayOrder: 1 },
  { productId: 20, productName: 'Curd', brandId: 1, category: 'Curd', categoryDisplayOrder: 2, displayOrder: 1 },
  { productId: 30, productName: 'Jersey Milk', brandId: 2, category: 'Milk', categoryDisplayOrder: 1, displayOrder: 1 },
];

function baseProps(overrides = {}) {
  return {
    show: true,
    salespeople: SALESPEOPLE,
    globalProducts: PRODUCTS,
    activeBrandId: 1,
    bulkProductForm: { selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable' },
    setBulkProductForm: vi.fn(),
    bulkProductSearch: '',
    setBulkProductSearch: vi.fn(),
    updatingBulkProducts: false,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe('BulkProductAccessModal', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<BulkProductAccessModal {...baseProps({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every salesperson and every product for the active brand only', () => {
    render(<BulkProductAccessModal {...baseProps()} />);
    expect(screen.getByText('Ramu')).toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.queryByText('Jersey Milk')).not.toBeInTheDocument(); // different brand
  });

  it('filters the product list by search text', () => {
    render(<BulkProductAccessModal {...baseProps({ bulkProductSearch: 'curd' })} />);
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('shows "No salesmen available" / "No products available" for empty lists', () => {
    render(<BulkProductAccessModal {...baseProps({ salespeople: [], globalProducts: [] })} />);
    expect(screen.getByText('No salesmen available')).toBeInTheDocument();
    expect(screen.getByText('No products available')).toBeInTheDocument();
  });

  it('shows "No products found" when a search matches nothing in the active brand', () => {
    render(<BulkProductAccessModal {...baseProps({ bulkProductSearch: 'zzz' })} />);
    expect(screen.getByText('No products found')).toBeInTheDocument();
  });

  it('checking a salesperson toggles them into selectedSalesmen', () => {
    const setBulkProductForm = vi.fn();
    render(<BulkProductAccessModal {...baseProps({ setBulkProductForm })} />);
    fireEvent.click(screen.getByText('Ramu').closest('label').querySelector('input'));
    const updater = setBulkProductForm.mock.calls[0][0];
    const result = updater({ selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable' });
    expect(result.selectedSalesmen.has(1)).toBe(true);
  });

  it('checking a product toggles it into selectedProducts', () => {
    const setBulkProductForm = vi.fn();
    render(<BulkProductAccessModal {...baseProps({ setBulkProductForm })} />);
    fireEvent.click(screen.getByText('Curd').closest('label').querySelector('input'));
    const updater = setBulkProductForm.mock.calls[0][0];
    const result = updater({ selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable' });
    expect(result.selectedProducts.has(20)).toBe(true);
  });

  it('Select All / Deselect All for salesmen toggles between all and none', () => {
    const setBulkProductForm = vi.fn();
    const { rerender } = render(<BulkProductAccessModal {...baseProps({ setBulkProductForm })} />);
    const salesmenPanel = () => screen.getByText('Ramu').closest('.bg-slate-50');
    fireEvent.click(within(salesmenPanel()).getByText('Select All'));
    let updater = setBulkProductForm.mock.calls[0][0];
    let result = updater({ selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable' });
    expect([...result.selectedSalesmen]).toEqual([1, 2]);

    rerender(<BulkProductAccessModal {...baseProps({
      setBulkProductForm,
      bulkProductForm: { selectedSalesmen: new Set([1, 2]), selectedProducts: new Set(), action: 'enable' },
    })} />);
    fireEvent.click(within(salesmenPanel()).getByText('Deselect All'));
    updater = setBulkProductForm.mock.calls[1][0];
    result = updater({ selectedSalesmen: new Set([1, 2]), selectedProducts: new Set(), action: 'enable' });
    expect(result.selectedSalesmen.size).toBe(0);
  });

  it('Select All for products selects every product across all brands, not just the active one', () => {
    const setBulkProductForm = vi.fn();
    render(<BulkProductAccessModal {...baseProps({ setBulkProductForm })} />);
    const productsPanel = screen.getByText('Curd').closest('.bg-slate-50');
    fireEvent.click(within(productsPanel).getByText('Select All'));
    const updater = setBulkProductForm.mock.calls[0][0];
    const result = updater({ selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable' });
    expect([...result.selectedProducts]).toEqual([10, 20, 30]);
  });

  it('changing the action select round-trips back into the <select>', () => {
    function Wrapper() {
      const [bulkProductForm, setBulkProductForm] = React.useState({
        selectedSalesmen: new Set(), selectedProducts: new Set(), action: 'enable',
      });
      return <BulkProductAccessModal {...baseProps({ bulkProductForm, setBulkProductForm })} />;
    }
    render(<Wrapper />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'disable' } });
    expect(select.value).toBe('disable');
  });

  it('Confirm is disabled until both a salesman and a product are selected', () => {
    const { rerender } = render(<BulkProductAccessModal {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

    rerender(<BulkProductAccessModal {...baseProps({
      bulkProductForm: { selectedSalesmen: new Set([1]), selectedProducts: new Set([10]), action: 'enable' },
    })} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
  });

  it('Confirm calls onSubmit, Cancel calls onClose', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<BulkProductAccessModal {...baseProps({
      onSubmit, onClose,
      bulkProductForm: { selectedSalesmen: new Set([1]), selectedProducts: new Set([10]), action: 'enable' },
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the updating state and disables Cancel too', () => {
    render(<BulkProductAccessModal {...baseProps({ updatingBulkProducts: true })} />);
    expect(screen.getByRole('button', { name: /Updating/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
