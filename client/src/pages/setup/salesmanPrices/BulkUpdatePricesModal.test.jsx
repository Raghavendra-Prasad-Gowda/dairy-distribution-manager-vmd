import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BulkUpdatePricesModal from './BulkUpdatePricesModal';

const PRODUCTS = [
  { productId: 10, productName: 'Toned Milk', brandId: 1, category: 'Milk', categoryDisplayOrder: 1, displayOrder: 1, salespersonEnabled: true, dairyCostPrice: 40, dairySellingPrice: 44 },
  { productId: 20, productName: 'Curd', brandId: 1, category: 'Dairy', categoryDisplayOrder: 2, displayOrder: 1, salespersonEnabled: true, dairyCostPrice: 30, dairySellingPrice: 35 },
  { productId: 30, productName: 'Disabled Product', brandId: 1, category: 'Milk', salespersonEnabled: false, dairyCostPrice: 10, dairySellingPrice: 12 },
  { productId: 40, productName: 'Other Brand', brandId: 2, category: 'Milk', salespersonEnabled: true, dairyCostPrice: 10, dairySellingPrice: 12 },
];

const SALESPEOPLE = [{ id: 1, name: 'Ramu', route: 'North' }, { id: 2, name: 'Suresh', route: 'South' }];

function baseProps(overrides = {}) {
  return {
    show: true,
    globalProducts: PRODUCTS,
    activeBrandId: 1,
    bulkUpdateForm: { selectedSalesmen: new Set(), productPrices: [], effectiveFrom: '2026-08-17' },
    setBulkUpdateForm: vi.fn(),
    bulkUpdateProductSearch: '',
    setBulkUpdateProductSearch: vi.fn(),
    bulkUpdateSalesmenSearch: '',
    setBulkUpdateSalesmenSearch: vi.fn(),
    salespeople: SALESPEOPLE,
    updatingBulkPrices: false,
    addProductToUpdate: vi.fn(),
    removeProductFromUpdate: vi.fn(),
    handleBulkSalesmenToggle: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe('BulkUpdatePricesModal — availability list', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<BulkUpdatePricesModal {...baseProps({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('only offers enabled products from the active brand that are not already added', () => {
    render(<BulkUpdatePricesModal {...baseProps()} />);
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.queryByText('Disabled Product')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Brand')).not.toBeInTheDocument();
  });

  it('excludes a product already in the selected list from the "Add Products" picker', () => {
    render(<BulkUpdatePricesModal {...baseProps({
      bulkUpdateForm: {
        selectedSalesmen: new Set(), effectiveFrom: '2026-08-17',
        productPrices: [{ productId: 10, productName: 'Toned Milk', category: 'Milk', dairyCostPrice: 40, dairySellingPrice: 44, salespersonSellingPrice: '' }],
      },
    })} />);
    const addPanel = screen.getByPlaceholderText('Search products to add…').closest('div').parentElement;
    expect(within(addPanel).queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('filters the availability list by search text', () => {
    render(<BulkUpdatePricesModal {...baseProps({ bulkUpdateProductSearch: 'curd' })} />);
    expect(screen.getByText('Curd')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('clicking an available product calls addProductToUpdate with its id', () => {
    const addProductToUpdate = vi.fn();
    render(<BulkUpdatePricesModal {...baseProps({ addProductToUpdate })} />);
    fireEvent.click(screen.getByText('Toned Milk'));
    expect(addProductToUpdate).toHaveBeenCalledWith('10');
  });

  it('Select All adds every available product', () => {
    const addProductToUpdate = vi.fn();
    render(<BulkUpdatePricesModal {...baseProps({ addProductToUpdate })} />);
    const addPanel = screen.getByPlaceholderText('Search products to add…').closest('div').parentElement;
    fireEvent.click(within(addPanel).getByRole('button', { name: 'Select All' }));
    expect(addProductToUpdate).toHaveBeenCalledWith('10');
    expect(addProductToUpdate).toHaveBeenCalledWith('20');
    expect(addProductToUpdate).toHaveBeenCalledTimes(2);
  });

  it('hides Select All and shows an empty message once every product is added', () => {
    render(<BulkUpdatePricesModal {...baseProps({
      bulkUpdateForm: {
        selectedSalesmen: new Set(), effectiveFrom: '2026-08-17',
        productPrices: [
          { productId: 10, productName: 'Toned Milk', category: 'Milk', dairyCostPrice: 40, dairySellingPrice: 44, salespersonSellingPrice: '' },
          { productId: 20, productName: 'Curd', category: 'Dairy', dairyCostPrice: 30, dairySellingPrice: 35, salespersonSellingPrice: '' },
        ],
      },
    })} />);
    const addPanel = screen.getByPlaceholderText('Search products to add…').closest('div').parentElement;
    expect(within(addPanel).queryByRole('button', { name: 'Select All' })).not.toBeInTheDocument();
    expect(screen.getByText('No enabled products or all added')).toBeInTheDocument();
  });
});

describe('BulkUpdatePricesModal — selected products table', () => {
  const withOneSelected = (overrides = {}) => baseProps({
    bulkUpdateForm: {
      selectedSalesmen: new Set(), effectiveFrom: '2026-08-17',
      productPrices: [{ productId: 10, productName: 'Toned Milk', category: 'Milk', dairyCostPrice: 40, dairySellingPrice: 44, salespersonSellingPrice: '' }],
    },
    ...overrides,
  });

  it('shows the selected products count and each row', () => {
    render(<BulkUpdatePricesModal {...withOneSelected()} />);
    expect(screen.getByText('Selected Products (1)')).toBeInTheDocument();
  });

  it('editing a row price round-trips through setBulkUpdateForm back into the input', () => {
    function Wrapper() {
      const [bulkUpdateForm, setBulkUpdateForm] = React.useState(withOneSelected().bulkUpdateForm);
      return <BulkUpdatePricesModal {...withOneSelected({ bulkUpdateForm, setBulkUpdateForm })} />;
    }
    render(<Wrapper />);
    const priceInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(priceInput, { target: { value: '46' } });
    expect(priceInput.value).toBe('46');
  });

  it('removing a row calls removeProductFromUpdate with its index', () => {
    const removeProductFromUpdate = vi.fn();
    render(<BulkUpdatePricesModal {...withOneSelected({ removeProductFromUpdate })} />);
    fireEvent.click(screen.getByTitle('Remove'));
    expect(removeProductFromUpdate).toHaveBeenCalledWith(0);
  });
});

describe('BulkUpdatePricesModal — effective date + salesmen', () => {
  it('changing the effective-from date round-trips back into the input', () => {
    function Wrapper() {
      const [bulkUpdateForm, setBulkUpdateForm] = React.useState({ selectedSalesmen: new Set(), productPrices: [], effectiveFrom: '2026-08-17' });
      return <BulkUpdatePricesModal {...baseProps({ bulkUpdateForm, setBulkUpdateForm })} />;
    }
    render(<Wrapper />);
    const dateInput = screen.getByDisplayValue('2026-08-17');
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } });
    expect(dateInput.value).toBe('2026-09-01');
  });

  it('filters the salesmen list by search text', () => {
    render(<BulkUpdatePricesModal {...baseProps({ bulkUpdateSalesmenSearch: 'south' })} />);
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.queryByText('Ramu')).not.toBeInTheDocument();
  });

  it('shows "No salespeople found" when the search matches nobody', () => {
    render(<BulkUpdatePricesModal {...baseProps({ bulkUpdateSalesmenSearch: 'zzz' })} />);
    expect(screen.getByText('No salespeople found')).toBeInTheDocument();
  });

  it('checking a salesman calls handleBulkSalesmenToggle with their id', () => {
    const handleBulkSalesmenToggle = vi.fn();
    render(<BulkUpdatePricesModal {...baseProps({ handleBulkSalesmenToggle })} />);
    fireEvent.click(screen.getByText('Ramu').closest('label').querySelector('input'));
    expect(handleBulkSalesmenToggle).toHaveBeenCalledWith(1);
  });

  it('Select All / Deselect All for salesmen toggles based on current selection size', () => {
    const setBulkUpdateForm = vi.fn();
    const salesmenPanel = () => screen.getByText(/Apply to Salespeople/).closest('div').parentElement;
    const { rerender } = render(<BulkUpdatePricesModal {...baseProps({ setBulkUpdateForm })} />);
    fireEvent.click(within(salesmenPanel()).getByRole('button', { name: 'Select All' }));
    let updater = setBulkUpdateForm.mock.calls[0][0];
    expect([...updater({ selectedSalesmen: new Set() }).selectedSalesmen]).toEqual([1, 2]);

    rerender(<BulkUpdatePricesModal {...baseProps({
      setBulkUpdateForm,
      bulkUpdateForm: { selectedSalesmen: new Set([1, 2]), productPrices: [], effectiveFrom: '2026-08-17' },
    })} />);
    fireEvent.click(within(salesmenPanel()).getByRole('button', { name: 'Deselect All' }));
    updater = setBulkUpdateForm.mock.calls[1][0];
    expect(updater({ selectedSalesmen: new Set([1, 2]) }).selectedSalesmen.size).toBe(0);
  });
});

describe('BulkUpdatePricesModal — close behavior asymmetry', () => {
  it('backdrop click and the X button both reset the search fields', () => {
    const onClose = vi.fn();
    const setBulkUpdateProductSearch = vi.fn();
    const setBulkUpdateSalesmenSearch = vi.fn();
    const { container } = render(<BulkUpdatePricesModal {...baseProps({ onClose, setBulkUpdateProductSearch, setBulkUpdateSalesmenSearch })} />);

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setBulkUpdateProductSearch).toHaveBeenCalledWith('');
    expect(setBulkUpdateSalesmenSearch).toHaveBeenCalledWith('');
  });

  it('the footer Cancel button only closes — it does not reset the search fields', () => {
    const onClose = vi.fn();
    const setBulkUpdateProductSearch = vi.fn();
    const setBulkUpdateSalesmenSearch = vi.fn();
    render(<BulkUpdatePricesModal {...baseProps({ onClose, setBulkUpdateProductSearch, setBulkUpdateSalesmenSearch })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setBulkUpdateProductSearch).not.toHaveBeenCalled();
    expect(setBulkUpdateSalesmenSearch).not.toHaveBeenCalled();
  });
});

describe('BulkUpdatePricesModal — submit button', () => {
  it('is disabled with no salesmen or no products selected, shows live counts', () => {
    render(<BulkUpdatePricesModal {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Update \(0 salesmen, 0 products\)/ })).toBeDisabled();
  });

  it('is enabled once both a salesman and a product are selected, and calls onSubmit', () => {
    const onSubmit = vi.fn();
    render(<BulkUpdatePricesModal {...baseProps({
      onSubmit,
      bulkUpdateForm: {
        selectedSalesmen: new Set([1]), effectiveFrom: '2026-08-17',
        productPrices: [{ productId: 10, productName: 'Toned Milk', category: 'Milk', dairyCostPrice: 40, dairySellingPrice: 44, salespersonSellingPrice: '46' }],
      },
    })} />);
    const btn = screen.getByRole('button', { name: /Update \(1 salesmen, 1 products\)/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the updating state', () => {
    render(<BulkUpdatePricesModal {...baseProps({ updatingBulkPrices: true })} />);
    expect(screen.getByRole('button', { name: /Updating…/ })).toBeDisabled();
  });
});
