/**
 * ResetLedgerModal tests.
 *
 * The action is irreversible, so the tests focus on the two gates holding:
 * the PIN must pass before the confirm dialog appears at all, and the exact
 * salesperson name must be typed before the delete button arms.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetLedgerModal from './ResetLedgerModal';

// Stand-in for the shared PIN gate: exposes a button that "passes" it, so the
// tests can assert the confirm step is unreachable until that happens.
vi.mock('./PinModal', () => ({
  default: ({ isOpen, onSuccess, title }) =>
    isOpen ? (
      <div data-testid="pin-modal">
        <span>{title}</span>
        <button onClick={onSuccess}>pass-pin</button>
      </div>
    ) : null,
}));

const SALESPERSON = { id: 1, name: 'K Pandu' };

function setup(overrides = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn().mockResolvedValue({ payments: 3, dispatches: 5, balances: 7 });
  const onClose = vi.fn();
  const notify  = vi.fn();
  // Note `??` would swallow an intentional null here, so check for the key.
  const salesperson = 'salesperson' in overrides ? overrides.salesperson : SALESPERSON;
  render(
    <ResetLedgerModal
      open={overrides.open ?? true}
      onClose={onClose}
      salesperson={salesperson}
      onConfirm={onConfirm}
      notify={notify}
    />
  );
  return { onConfirm, onClose, notify };
}

/** Clears the PIN gate so the confirm step renders. */
function passPin() {
  fireEvent.click(screen.getByText('pass-pin'));
}

beforeEach(() => vi.clearAllMocks());

describe('ResetLedgerModal — PIN gate', () => {
  it('shows the PIN modal first, not the confirm step', () => {
    setup();
    expect(screen.getByTestId('pin-modal')).toBeInTheDocument();
    expect(screen.queryByText(/Type/i)).toBeNull();
  });

  it('names the salesperson in the PIN prompt', () => {
    setup();
    expect(screen.getByText(/K Pandu/)).toBeInTheDocument();
  });

  it('reveals the confirm step only after the PIN passes', () => {
    setup();
    passPin();
    expect(screen.queryByTestId('pin-modal')).toBeNull();
    expect(screen.getByRole('button', { name: /Clear ledger/i })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('pin-modal')).toBeNull();
  });

  it('renders nothing when no salesperson is selected', () => {
    setup({ salesperson: null });
    expect(screen.queryByTestId('pin-modal')).toBeNull();
  });
});

describe('ResetLedgerModal — name confirmation', () => {
  it('spells out exactly what will be deleted, and what survives', () => {
    setup();
    passPin();

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/login, custom prices and product access are kept/i)).toBeInTheDocument();
    expect(screen.getByText(/Stock Balance report/i)).toBeInTheDocument();
  });

  it('keeps the delete button disabled until the name matches', () => {
    setup();
    passPin();
    const confirm = screen.getByRole('button', { name: /Clear ledger/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('K Pandu'), { target: { value: 'K Pandu' } });
    expect(confirm).toBeEnabled();
  });

  it('rejects a near-miss name', () => {
    setup();
    passPin();

    fireEvent.change(screen.getByPlaceholderText('K Pandu'), { target: { value: 'K Pand' } });
    expect(screen.getByRole('button', { name: /Clear ledger/i })).toBeDisabled();
    expect(screen.getByText(/doesn't match yet/i)).toBeInTheDocument();
  });

  it('is case-sensitive — a lowercase name does not arm it', () => {
    setup();
    passPin();

    fireEvent.change(screen.getByPlaceholderText('K Pandu'), { target: { value: 'k pandu' } });
    expect(screen.getByRole('button', { name: /Clear ledger/i })).toBeDisabled();
  });

  it('tolerates surrounding whitespace', () => {
    setup();
    passPin();

    fireEvent.change(screen.getByPlaceholderText('K Pandu'), { target: { value: '  K Pandu  ' } });
    expect(screen.getByRole('button', { name: /Clear ledger/i })).toBeEnabled();
  });
});

describe('ResetLedgerModal — confirming', () => {
  function armAndConfirm() {
    passPin();
    fireEvent.change(screen.getByPlaceholderText('K Pandu'), { target: { value: 'K Pandu' } });
    fireEvent.click(screen.getByRole('button', { name: /Clear ledger/i }));
  }

  it('sends the typed name so the API can re-verify it', async () => {
    const { onConfirm } = setup();
    armAndConfirm();

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('K Pandu'));
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
      'Ledger cleared — removed 3 payment(s), 5 dispatch(es)',
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
