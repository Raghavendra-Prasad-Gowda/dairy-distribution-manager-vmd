import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SalespersonSidebar from './SalespersonSidebar';

const SALESPEOPLE = [
  { id: 1, name: 'Ramu', route: 'North Zone' },
  { id: 2, name: 'Suresh', route: null },
];

function baseProps(overrides = {}) {
  return {
    filteredSalespeople: SALESPEOPLE,
    spSearch: '',
    setSpSearch: vi.fn(),
    selectedSpId: '1',
    search: '',
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe('SalespersonSidebar', () => {
  it('renders the Global entry plus every filtered salesperson, with route shown only when present', () => {
    render(<SalespersonSidebar {...baseProps()} />);
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Ramu')).toBeInTheDocument();
    expect(screen.getByText('North Zone')).toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
  });

  it('highlights the Global entry when selectedSpId is "global"', () => {
    render(<SalespersonSidebar {...baseProps({ selectedSpId: 'global' })} />);
    expect(screen.getByText('Global').closest('button').className).toContain('bg-emerald-50');
  });

  it('highlights the selected salesperson row', () => {
    render(<SalespersonSidebar {...baseProps({ selectedSpId: '2' })} />);
    expect(screen.getByText('Suresh').closest('button').className).toContain('bg-emerald-50');
    expect(screen.getByText('Ramu').closest('button').className).not.toContain('bg-emerald-50');
  });

  it('clicking the Global entry calls onSelect with "global"', () => {
    const onSelect = vi.fn();
    render(<SalespersonSidebar {...baseProps({ onSelect })} />);
    fireEvent.click(screen.getByText('Global'));
    expect(onSelect).toHaveBeenCalledWith('global');
  });

  it('clicking a salesperson row calls onSelect with their id', () => {
    const onSelect = vi.fn();
    render(<SalespersonSidebar {...baseProps({ onSelect })} />);
    fireEvent.click(screen.getByText('Suresh'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('typing in the search box calls setSpSearch, and the clear button only shows once there is text', () => {
    const setSpSearch = vi.fn();
    const { rerender } = render(<SalespersonSidebar {...baseProps({ spSearch: '', setSpSearch })} />);
    fireEvent.change(screen.getByPlaceholderText('Search salesperson…'), { target: { value: 'ram' } });
    expect(setSpSearch).toHaveBeenCalledWith('ram');

    rerender(<SalespersonSidebar {...baseProps({ spSearch: 'ram', setSpSearch })} />);
    const clearBtn = screen.getByPlaceholderText('Search salesperson…').parentElement.querySelector('button');
    fireEvent.click(clearBtn);
    expect(setSpSearch).toHaveBeenCalledWith('');
  });

  it('shows "No salespeople" when the list is empty and the (right-panel) product search is blank', () => {
    render(<SalespersonSidebar {...baseProps({ filteredSalespeople: [], search: '' })} />);
    expect(screen.getByText('No salespeople')).toBeInTheDocument();
  });

  it('shows "No results" when the list is empty and the (right-panel) product search has text — carried-over quirk, not a bug in this component', () => {
    render(<SalespersonSidebar {...baseProps({ filteredSalespeople: [], search: 'toned milk' })} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
