/**
 * ResetLedgerModal tests.
 *
 * The action is irreversible, so the tests focus on the PIN gate holding
 * before the picker is reachable, Select All composing with the search box,
 * and the selected ids being what gets sent.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetLedgerModal from './ResetLedgerModal';

// Stand-in for the shared PIN gate: exposes a button that "passes" it, so the
// tests can assert the picker is unreachable until that happens.
vi.mock('./PinModal', () => ({
  default: ({ isOpen, onSuccess, title }) =>
    isOpen ? (
      <div data-testid="pin-modal">
        <span>{title}</span>
        <button onClick={onSuccess}>pass-pin</button>
      </div>
    ) : null,
}));

const SALESPEOPLE = [
  { id: 1, name: 'K Pandu', route: 'Route 1' },
  { id: 2, name: 'Mahesh',  route: 'Route 2' },
  { id: 3, name: 'Ravi',    route: 'Route 1' },
];

function setup(overrides = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn().mockResolvedValue({
    salespeople: ['K Pandu'], payments: 3, dispatches: 5, balances: 7,
  });
  const onClose = vi.fn();
  const notify  = vi.fn();
  // Note `??` would swallow an intentional null here, so check for the key.
  const salespeople = 'salespeople' in overrides ? overrides.salespeople : SALESPEOPLE;
  render(
    <ResetLedgerModal
      open={overrides.open ?? true}
      onClose={onClose}
      salespeople={salespeople}
      onConfirm={onConfirm}
      notify={notify}
    />
  );
  return { onConfirm, onClose, notify };
}

/** Clears the PIN gate so the picker renders. */
function passPin() {
  fireEvent.click(screen.getByText('pass-pin'));
}

beforeEach(() => vi.clearAllMocks());

describe('ResetLedgerModal — PIN gate', () => {
  it('shows the PIN modal first, not the picker', () => {
    setup();
    expect(screen.getByTestId('pin-modal')).toBeInTheDocument();
    expect(screen.queryByText('K Pandu')).toBeNull();
  });

  it('reveals the picker only after the PIN passes', () => {
    setup();
    passPin();
    expect(screen.queryByTestId('pin-modal')).toBeNull();
    expect(screen.getByText('K Pandu')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('pin-modal')).toBeNull();
  });
});

describe('ResetLedgerModal — warning', () => {
  it('spells out exactly what will be deleted, and what survives', () => {
    setup();
    passPin();

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/logins, custom prices and product access are kept/i)).toBeInTheDocument();
    expect(screen.getByText(/Stock Balance report/i)).toBeInTheDocument();
  });
});

describe('ResetLedgerModal — selection', () => {
  it('keeps the confirm button disabled until something is picked', () => {
    setup();
    passPin();
    const confirm = screen.getByRole('button', { name: /Clear ledger/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByText('K Pandu'));
    expect(confirm).toBeEnabled();
  });

  it('pluralises the button once several are picked', () => {
    setup();
    passPin();
    fireEvent.click(screen.getByText('K Pandu'));
    fireEvent.click(screen.getByText('Mahesh'));

    expect(screen.getByRole('button', { name: /Clear 2 ledgers/i })).toBeInTheDocument();
  });

  it('tracks how many are selected', () => {
    setup();
    passPin();
    expect(screen.getByText('0 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('K Pandu'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('toggles a salesperson off when clicked twice', () => {
    setup();
    passPin();
    fireEvent.click(screen.getByText('K Pandu'));
    fireEvent.click(screen.getByText('K Pandu'));

    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('filters by name or route', () => {
    setup();
    passPin();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 2' },
    });

    expect(screen.getByText('Mahesh')).toBeInTheDocument();
    expect(screen.queryByText('K Pandu')).toBeNull();
  });
});

describe('ResetLedgerModal — Select All', () => {
  it('selects every salesperson', () => {
    setup();
    passPin();
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('flips to Deselect All and clears', () => {
    setup();
    passPin();
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    fireEvent.click(screen.getByRole('button', { name: /Deselect All/i }));

    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('applies only to the current search results', () => {
    setup();
    passPin();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    // K Pandu + Ravi are on Route 1; Mahesh must be left out.
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
});

describe('ResetLedgerModal — confirming', () => {
  function armAndConfirm(names = ['K Pandu']) {
    passPin();
    names.forEach(n => fireEvent.click(screen.getByText(n)));
    fireEvent.click(screen.getByRole('button', { name: /Clear \d* ?ledgers?/i }));
  }

  it('sends the selected ids', async () => {
    const { onConfirm } = setup();
    armAndConfirm(['K Pandu', 'Ravi']);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([1, 3]));
  });

  it('shows the global loading notification while working', async () => {
    const { notify } = setup();
    armAndConfirm();

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Clearing ledger…', 'loading'));
  });

  it('reports what was removed, then closes', async () => {
    const { notify, onClose } = setup();
    armAndConfirm();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(
      'Ledger cleared for 1 salesperson(s) — removed 3 payment(s), 5 dispatch(es)',
      'success'
    );
  });

  it('surfaces an API refusal and stays open', async () => {
    const onConfirm = vi.fn().mockRejectedValue({
      response: { data: { error: 'Super admin access required' } },
    });
    const { notify, onClose } = setup({ onConfirm });
    armAndConfirm();

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Super admin access required', 'error')
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
