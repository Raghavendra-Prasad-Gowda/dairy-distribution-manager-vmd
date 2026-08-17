import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PriceToolbar from './PriceToolbar';

function baseProps(overrides = {}) {
  return {
    isGlobal: false,
    search: '',
    setSearch: vi.fn(),
    showEnabledOnly: true,
    setShowEnabledOnly: vi.fn(),
    isSuperAdmin: false,
    onOpenCopyModal: vi.fn(),
    onOpenBulkUpdateModal: vi.fn(),
    onOpenBulkProductModal: vi.fn(),
    onOpenExceptionModal: vi.fn(),
    onOpenAllSalesmenPrices: vi.fn(),
    onOpenClearAllConfirm: vi.fn(),
    onToggleAllGlobal: vi.fn(),
    allBrandEnabled: false,
    allBrandDisabled: false,
    onSave: vi.fn(),
    saving: false,
    hasDirty: true,
    ...overrides,
  };
}

describe('PriceToolbar — per-person mode', () => {
  it('shows the enabled-only toggle and Copy Prices, hides every global-only action', () => {
    render(<PriceToolbar {...baseProps({ isGlobal: false })} />);
    expect(screen.getByRole('button', { name: 'Enabled only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Prices/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bulk Update Prices/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View Price List/ })).not.toBeInTheDocument();
  });

  it('clicking Copy Prices calls onOpenCopyModal', () => {
    const onOpenCopyModal = vi.fn();
    render(<PriceToolbar {...baseProps({ onOpenCopyModal })} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Prices/ }));
    expect(onOpenCopyModal).toHaveBeenCalledTimes(1);
  });

  it('toggling "Enabled only" flips the label and persists the choice to localStorage', () => {
    const setShowEnabledOnly = vi.fn(fn => fn(true)); // simulate the functional update running
    render(<PriceToolbar {...baseProps({ showEnabledOnly: true, setShowEnabledOnly })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enabled only' }));

    expect(setShowEnabledOnly).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('sp_showEnabledOnly')).toBe('false');
  });

  it('shows "Show all" label when showEnabledOnly is false', () => {
    render(<PriceToolbar {...baseProps({ showEnabledOnly: false })} />);
    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument();
  });
});

describe('PriceToolbar — global mode', () => {
  it('shows every global action and hides the per-person-only ones', () => {
    render(<PriceToolbar {...baseProps({ isGlobal: true })} />);
    expect(screen.getByRole('button', { name: 'Enable All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bulk Update Prices/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bulk Product Access/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Price List/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear All Salesman Prices/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enabled only' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Copy Prices/ })).not.toBeInTheDocument();
  });

  it('Exception Manager only appears for a superadmin', () => {
    const { rerender } = render(<PriceToolbar {...baseProps({ isGlobal: true, isSuperAdmin: false })} />);
    expect(screen.queryByRole('button', { name: /Exception Manager/ })).not.toBeInTheDocument();

    rerender(<PriceToolbar {...baseProps({ isGlobal: true, isSuperAdmin: true })} />);
    expect(screen.getByRole('button', { name: /Exception Manager/ })).toBeInTheDocument();
  });

  it('Enable All is disabled once everything in the brand is already enabled', () => {
    render(<PriceToolbar {...baseProps({ isGlobal: true, allBrandEnabled: true, allBrandDisabled: false })} />);
    expect(screen.getByRole('button', { name: 'Enable All' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disable All' })).not.toBeDisabled();
  });

  it('Disable All is disabled once everything in the brand is already disabled', () => {
    render(<PriceToolbar {...baseProps({ isGlobal: true, allBrandEnabled: false, allBrandDisabled: true })} />);
    expect(screen.getByRole('button', { name: 'Disable All' })).toBeDisabled();
  });

  it.each([
    ['Enable All', 'onToggleAllGlobal', true],
    ['Disable All', 'onToggleAllGlobal', false],
  ])('%s calls onToggleAllGlobal(%s)', (label, _fnName, arg) => {
    const onToggleAllGlobal = vi.fn();
    render(<PriceToolbar {...baseProps({ isGlobal: true, onToggleAllGlobal })} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onToggleAllGlobal).toHaveBeenCalledWith(arg);
  });

  it('every global action button fires its own handler', () => {
    const handlers = {
      onOpenBulkUpdateModal: vi.fn(),
      onOpenBulkProductModal: vi.fn(),
      onOpenExceptionModal: vi.fn(),
      onOpenAllSalesmenPrices: vi.fn(),
      onOpenClearAllConfirm: vi.fn(),
    };
    render(<PriceToolbar {...baseProps({ isGlobal: true, isSuperAdmin: true, ...handlers })} />);

    fireEvent.click(screen.getByRole('button', { name: /Bulk Update Prices/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bulk Product Access/ }));
    fireEvent.click(screen.getByRole('button', { name: /Exception Manager/ }));
    fireEvent.click(screen.getByRole('button', { name: /View Price List/ }));
    fireEvent.click(screen.getByRole('button', { name: /Clear All Salesman Prices/ }));

    expect(handlers.onOpenBulkUpdateModal).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenBulkProductModal).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenExceptionModal).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenAllSalesmenPrices).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenClearAllConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('PriceToolbar — search box', () => {
  it('typing calls setSearch, and a clear (x) button only appears once there is text', () => {
    const setSearch = vi.fn();
    const { rerender } = render(<PriceToolbar {...baseProps({ search: '', setSearch })} />);
    expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by product name/), { target: { value: 'milk' } });
    expect(setSearch).toHaveBeenCalledWith('milk');

    rerender(<PriceToolbar {...baseProps({ search: 'milk', setSearch })} />);
    const clearBtn = screen.getByPlaceholderText(/Search by product name/).parentElement.querySelector('button');
    fireEvent.click(clearBtn);
    expect(setSearch).toHaveBeenCalledWith('');
  });
});

describe('PriceToolbar — Save button', () => {
  it('is disabled when there is nothing dirty to save', () => {
    render(<PriceToolbar {...baseProps({ hasDirty: false })} />);
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  it('is disabled and shows "Saving…" while a save is in flight', () => {
    render(<PriceToolbar {...baseProps({ saving: true })} />);
    expect(screen.getByRole('button', { name: /Saving…/ })).toBeDisabled();
  });

  it('calls onSave when clicked while enabled', () => {
    const onSave = vi.fn();
    render(<PriceToolbar {...baseProps({ hasDirty: true, saving: false, onSave })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
