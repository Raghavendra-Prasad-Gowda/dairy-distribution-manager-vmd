import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExceptionManagerModal from './ExceptionManagerModal';

const BRANDS = [{ id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' }];

const PRODUCTS = [
  { productId: 10, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', categoryDisplayOrder: 1, salespersonEnabled: false, dairyCostPrice: 40, dairySellingPrice: 44 },
  { productId: 20, productName: 'Ghee', brandId: 1, brandName: 'Nandini', category: 'Dairy', categoryDisplayOrder: 2, salespersonEnabled: false, dairyCostPrice: 400, dairySellingPrice: 440 },
  { productId: 30, productName: 'Jersey Milk', brandId: 2, brandName: 'Jersey', category: 'Milk', categoryDisplayOrder: 1, salespersonEnabled: false, dairyCostPrice: 40, dairySellingPrice: 42 },
  { productId: 40, productName: 'Already Enabled', brandId: 1, brandName: 'Nandini', category: 'Milk', salespersonEnabled: true, dairyCostPrice: 10, dairySellingPrice: 12 },
];

const SALESPEOPLE = [{ id: 1, name: 'Ramu', route: 'North' }, { id: 2, name: 'Suresh', route: 'South' }];

function baseProps(overrides = {}) {
  return {
    show: true,
    globalProducts: PRODUCTS,
    brands: BRANDS,
    salespeople: SALESPEOPLE,
    exceptionForm: { selectedProducts: new Set(), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    setExceptionForm: vi.fn(),
    exProductSearch: '',
    setExProductSearch: vi.fn(),
    exSpSearch: '',
    setExSpSearch: vi.fn(),
    savingExceptions: false,
    onClose: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

describe('ExceptionManagerModal — visibility and product list', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<ExceptionManagerModal {...baseProps({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('only lists globally-disabled products, grouped by brand in brands-array order', () => {
    render(<ExceptionManagerModal {...baseProps()} />);
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Ghee')).toBeInTheDocument();
    expect(screen.getByText('Jersey Milk')).toBeInTheDocument();
    expect(screen.queryByText('Already Enabled')).not.toBeInTheDocument();
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Jersey')).toBeInTheDocument();
  });

  it('shows the "all enabled" message when there are no globally-disabled products at all', () => {
    render(<ExceptionManagerModal {...baseProps({ globalProducts: [PRODUCTS[3]] })} />);
    expect(screen.getByText(/nothing to create exceptions for/)).toBeInTheDocument();
  });

  it('filters the disabled-product list by search text', () => {
    render(<ExceptionManagerModal {...baseProps({ exProductSearch: 'ghee' })} />);
    expect(screen.getByText('Ghee')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('shows a "no matches" message when the search matches no disabled product', () => {
    render(<ExceptionManagerModal {...baseProps({ exProductSearch: 'zzz' })} />);
    expect(screen.getByText('No matching globally-disabled products.')).toBeInTheDocument();
  });

  it('checking a product toggles it into selectedProducts', () => {
    const setExceptionForm = vi.fn();
    render(<ExceptionManagerModal {...baseProps({ setExceptionForm })} />);
    fireEvent.click(screen.getByText('Toned Milk').closest('label').querySelector('input'));
    const updater = setExceptionForm.mock.calls[0][0];
    const result = updater({ selectedProducts: new Set(), selectedSalesmen: new Set(), action: 'enable', prices: {} });
    expect(result.selectedProducts.has(10)).toBe(true);
  });

  it('Select All (products) selects every currently-visible disabled product', () => {
    const setExceptionForm = vi.fn();
    render(<ExceptionManagerModal {...baseProps({ setExceptionForm })} />);
    const productsPanel = screen.getByText('Toned Milk').closest('.bg-slate-50');
    fireEvent.click(within(productsPanel.parentElement).getByRole('button', { name: /Select All/ }));
    const updater = setExceptionForm.mock.calls[0][0];
    const result = updater({ selectedProducts: new Set(), selectedSalesmen: new Set(), action: 'enable', prices: {} });
    expect([...result.selectedProducts].sort()).toEqual([10, 20, 30]);
  });
});

describe('ExceptionManagerModal — action + price entry', () => {
  it('shows the price input only for a checked product while action is "enable"', () => {
    render(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.getByPlaceholderText('44')).toBeInTheDocument(); // dairySellingPrice used as placeholder
  });

  it('hides every price input once the action is switched to "disable"', () => {
    render(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set(), action: 'disable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.queryByPlaceholderText('44')).not.toBeInTheDocument();
  });

  it('switching the action button calls setExceptionForm with the new action', () => {
    const setExceptionForm = vi.fn();
    render(<ExceptionManagerModal {...baseProps({ setExceptionForm })} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove exception/ }));
    const updater = setExceptionForm.mock.calls[0][0];
    expect(updater({ action: 'enable' }).action).toBe('disable');
  });

  it('"Use dairy MRP for all" only appears once at least one product is selected while enabling', () => {
    const { rerender } = render(<ExceptionManagerModal {...baseProps()} />);
    expect(screen.queryByText('Use dairy MRP for all')).not.toBeInTheDocument();

    rerender(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.getByText('Use dairy MRP for all')).toBeInTheDocument();
  });

  it('"Use dairy MRP for all" fills every selected product\'s price from its dairy selling price', () => {
    const setExceptionForm = vi.fn();
    render(<ExceptionManagerModal {...baseProps({
      setExceptionForm,
      exceptionForm: { selectedProducts: new Set([10, 20]), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    fireEvent.click(screen.getByText('Use dairy MRP for all'));
    const updater = setExceptionForm.mock.calls[0][0];
    const result = updater({ prices: {} });
    expect(result.prices).toEqual({ 10: '44', 20: '440' });
  });

  it('the effective-from date only appears once at least one price has been entered', () => {
    const { rerender } = render(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.queryByText('Prices From')).not.toBeInTheDocument();

    rerender(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set(), action: 'enable', prices: { 10: '46' }, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.getByText('Prices From')).toBeInTheDocument();
  });
});

describe('ExceptionManagerModal — salespeople', () => {
  it('filters the salespeople list by search text', () => {
    render(<ExceptionManagerModal {...baseProps({ exSpSearch: 'south' })} />);
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.queryByText('Ramu')).not.toBeInTheDocument();
  });

  it('checking a salesperson toggles them into selectedSalesmen', () => {
    const setExceptionForm = vi.fn();
    render(<ExceptionManagerModal {...baseProps({ setExceptionForm })} />);
    fireEvent.click(screen.getByText('Ramu').closest('label').querySelector('input'));
    const updater = setExceptionForm.mock.calls[0][0];
    const result = updater({ selectedSalesmen: new Set() });
    expect(result.selectedSalesmen.has(1)).toBe(true);
  });

  it('shows "No salespeople found" when the search matches nobody', () => {
    render(<ExceptionManagerModal {...baseProps({ exSpSearch: 'zzz' })} />);
    expect(screen.getByText('No salespeople found')).toBeInTheDocument();
  });
});

describe('ExceptionManagerModal — footer', () => {
  it('Save is disabled until both a product and a salesperson are selected', () => {
    const { rerender } = render(<ExceptionManagerModal {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Enable \(0P × 0S\)/ })).toBeDisabled();

    rerender(<ExceptionManagerModal {...baseProps({
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set([1]), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.getByRole('button', { name: /Enable \(1P × 1S\)/ })).not.toBeDisabled();
  });

  it('Save calls onSave, Cancel calls onClose (and clears the search boxes)', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const setExProductSearch = vi.fn();
    const setExSpSearch = vi.fn();
    render(<ExceptionManagerModal {...baseProps({
      onSave, onClose, setExProductSearch, setExSpSearch,
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set([1]), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /Enable \(1P × 1S\)/ }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the saving state', () => {
    render(<ExceptionManagerModal {...baseProps({
      savingExceptions: true,
      exceptionForm: { selectedProducts: new Set([10]), selectedSalesmen: new Set([1]), action: 'enable', prices: {}, effectiveFrom: '2026-08-17' },
    })} />);
    expect(screen.getByRole('button', { name: /Applying…/ })).toBeDisabled();
  });
});
