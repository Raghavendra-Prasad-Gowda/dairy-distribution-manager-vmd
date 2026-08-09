/**
 * BulkTopUpModal tests.
 *
 * Covers the two-step picker (select salespeople → enter amounts), Select All
 * composing with the search box, skipping rows left blank, and the global
 * loading notification used in place of an in-button spinner.
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkTopUpModal from './BulkTopUpModal';

vi.mock('../utils/dateUtils', async () => {
  const actual = await vi.importActual('../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-08' };
});

const SALESPEOPLE = [
  { id: 1, name: 'K Pandu',  route: 'Route 1' },
  { id: 2, name: 'Mahesh',   route: 'Route 2' },
  { id: 3, name: 'Ravi',     route: 'Route 1' },
];

function setup(overrides = {}) {
  const onSaved = overrides.onSaved ?? vi.fn().mockResolvedValue({ count: 1, total: 500 });
  const onClose = vi.fn();
  const notify  = vi.fn();
  render(
    <BulkTopUpModal
      open
      onClose={onClose}
      entities={SALESPEOPLE}
      onSaved={onSaved}
      notify={notify}
    />
  );
  return { onSaved, onClose, notify };
}

/** Ticks the named salespeople and advances to the amounts step. */
function pickAndContinue(names) {
  names.forEach(n => fireEvent.click(screen.getByText(n)));
  fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
}

beforeEach(() => vi.clearAllMocks());

describe('BulkTopUpModal — selection step', () => {
  it('warns that a top-up increases what the salesman owes', () => {
    setup();
    expect(screen.getByText(/increases/i)).toBeInTheDocument();
    expect(screen.getByText(/not a collection/i)).toBeInTheDocument();
  });

  it('disables Next until at least one salesperson is picked', () => {
    setup();
    const next = screen.getByRole('button', { name: /^Next$/ });
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByText('K Pandu'));
    expect(next).toBeEnabled();
  });

  it('tracks how many are selected', () => {
    setup();
    expect(screen.getByText('0 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('K Pandu'));
    fireEvent.click(screen.getByText('Mahesh'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('toggles a salesperson off when clicked twice', () => {
    setup();
    fireEvent.click(screen.getByText('K Pandu'));
    fireEvent.click(screen.getByText('K Pandu'));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('filters the list by name or route', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 1' },
    });

    expect(screen.getByText('K Pandu')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
    expect(screen.queryByText('Mahesh')).toBeNull();
  });

  it('uses the plural noun for the list count when there is more than one entity', () => {
    setup();
    expect(screen.getByText('3 salespeople')).toBeInTheDocument();
  });

  it('uses the singular noun for the list count when there is exactly one entity', () => {
    render(
      <BulkTopUpModal
        open
        onClose={vi.fn()}
        entities={[{ id: 1, name: 'Nandini' }]}
        onSaved={vi.fn()}
        notify={vi.fn()}
        entryKey="brandId"
        nounSingular="brand"
        nounPlural="brands"
      />
    );
    expect(screen.getByText('1 brand')).toBeInTheDocument();
    expect(screen.queryByText('1 brands')).toBeNull();
  });
});

describe('BulkTopUpModal — Select All', () => {
  it('selects every salesperson', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('flips to Deselect All once everything is picked, and clears', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    const deselect = screen.getByRole('button', { name: /Deselect All/i });
    fireEvent.click(deselect);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('applies only to the current search results', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    // K Pandu + Ravi are on Route 1; Mahesh must be left out.
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('adds to an existing selection rather than replacing it', () => {
    setup();
    fireEvent.click(screen.getByText('Mahesh'));

    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));

    // Mahesh (picked earlier) plus the two Route 1 salespeople.
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });
});

describe('BulkTopUpModal — amounts step', () => {
  it('lists only the salespeople that were picked', () => {
    setup();
    pickAndContinue(['K Pandu']);

    expect(screen.getByText('K Pandu')).toBeInTheDocument();
    expect(screen.queryByText('Mahesh')).toBeNull();
  });

  it('keeps the submit button disabled until a valid amount is entered', () => {
    setup();
    pickAndContinue(['K Pandu']);

    const submit = screen.getByRole('button', { name: /Add top-up/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    expect(submit).toBeEnabled();
  });

  it('ignores zero and negative amounts', () => {
    setup();
    pickAndContinue(['K Pandu']);
    const submit = screen.getByRole('button', { name: /Add top-up/i });

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '-100' } });
    expect(submit).toBeDisabled();
  });

  it('running-totals the amounts entered', () => {
    setup();
    pickAndContinue(['K Pandu', 'Mahesh']);

    const [first, second] = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(first,  { target: { value: '5000' } });
    fireEvent.change(second, { target: { value: '2500' } });

    expect(screen.getByText('₹7,500.00')).toBeInTheDocument();
  });

  it('says how many blank rows will be skipped', () => {
    setup();
    pickAndContinue(['K Pandu', 'Mahesh']);

    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '5000' } });
    expect(screen.getByText(/1 selected salesperson without an amount will be skipped/i))
      .toBeInTheDocument();
  });

  it('Back returns to the picker with the selection intact', () => {
    setup();
    pickAndContinue(['K Pandu', 'Mahesh']);

    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
});

describe('BulkTopUpModal — saving', () => {
  it('submits only the rows that carry an amount', async () => {
    const { onSaved } = setup();
    pickAndContinue(['K Pandu', 'Mahesh']);

    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      paymentDate: '2026-08-08',
      entries: [{ salespersonId: 1, amount: 5000 }],
    });
  });

  it('passes the note through when one is typed', async () => {
    const { onSaved } = setup();
    pickAndContinue(['K Pandu']);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    fireEvent.change(screen.getByPlaceholderText(/Opening dues as of/i), {
      target: { value: 'Legacy dues' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0].notes).toBe('Legacy dues');
  });

  it('raises the global loading notification instead of an in-button spinner', async () => {
    const { notify } = setup();
    pickAndContinue(['K Pandu']);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Adding top-up…', 'loading'));
  });

  it('reports success and closes', async () => {
    const onSaved = vi.fn().mockResolvedValue({ count: 2, total: 7500 });
    const { notify, onClose } = setup({ onSaved });
    pickAndContinue(['K Pandu']);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith('Top-up added for 2 salespeople', 'success');
  });

  it('surfaces the API error and stays open so the entry is not lost', async () => {
    const onSaved = vi.fn().mockRejectedValue({
      response: { data: { error: 'Super admin access required' } },
    });
    const { notify, onClose } = setup({ onSaved });
    pickAndContinue(['K Pandu']);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Super admin access required', 'error')
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── Dairy configuration of the same modal ───────────────────────────────────

describe('BulkTopUpModal — dairy (brands) mode', () => {
  const BRANDS = [
    { id: 1, name: 'Nandini' },
    { id: 2, name: 'Jersey' },
    { id: 3, name: 'Gowardhan' },
  ];

  function setupDairy(overrides = {}) {
    const onSaved = overrides.onSaved ?? vi.fn().mockResolvedValue({ count: 1, total: 500 });
    const onClose = vi.fn();
    const notify  = vi.fn();
    render(
      <BulkTopUpModal
        open
        onClose={onClose}
        entities={BRANDS}
        onSaved={onSaved}
        notify={notify}
        entryKey="brandId"
        nounSingular="brand"
        nounPlural="brands"
        searchPlaceholder="Search brand…"
        warning={<>A top-up <strong>increases</strong> what the dairy owes this brand.</>}
      />
    );
    return { onSaved, onClose, notify };
  }

  it('labels the picker with the brand noun', () => {
    setupDairy();
    expect(screen.getByText('3 brands')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search brand…')).toBeInTheDocument();
  });

  it('shows the dairy-specific warning instead of the salesman one', () => {
    setupDairy();
    expect(screen.getByText(/what the dairy owes this brand/i)).toBeInTheDocument();
    expect(screen.queryByText(/My Balance/i)).toBeNull();
  });

  it('keys the entries by brandId, not salespersonId', async () => {
    const { onSaved } = setupDairy();
    fireEvent.click(screen.getByText('Nandini'));
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0].entries).toEqual([{ brandId: 1, amount: 50000 }]);
  });

  it('Select All works across brands too', () => {
    setupDairy();
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('pluralises the success message with the brand noun', async () => {
    const onSaved = vi.fn().mockResolvedValue({ count: 3, total: 9000 });
    const { notify } = setupDairy({ onSaved });
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Top-up added for 3 brands', 'success')
    );
  });
});

// ─── paymentMode / titlePrefix — one endpoint, two labelled flows ────────────

describe('BulkTopUpModal — paymentMode override', () => {
  it('omits paymentMode from the payload when not provided (server default applies)', async () => {
    const { onSaved } = setup();
    pickAndContinue(['K Pandu']);

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).not.toHaveProperty('paymentMode');
  });

  it('forwards a custom paymentMode into the payload', async () => {
    const onSaved = vi.fn().mockResolvedValue({ count: 1, total: 20000 });
    const onClose = vi.fn();
    const notify  = vi.fn();
    render(
      <BulkTopUpModal
        open
        onClose={onClose}
        entities={SALESPEOPLE}
        onSaved={onSaved}
        notify={notify}
        paymentMode="Deposit Top-up"
      />
    );
    pickAndContinue(['K Pandu']);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0].paymentMode).toBe('Deposit Top-up');
  });

  it('uses titlePrefix in the modal heading instead of the generic default', () => {
    render(
      <BulkTopUpModal
        open
        onClose={vi.fn()}
        entities={SALESPEOPLE}
        onSaved={vi.fn()}
        notify={vi.fn()}
        titlePrefix="Deposit Top-up"
      />
    );
    expect(screen.getByText('Deposit Top-up')).toBeInTheDocument();
    expect(screen.getByText(/select salespeople/i)).toBeInTheDocument();
  });
});

// ─── actionNoun — spinner/toast text matches what's actually happening ───────
// A caller with a more specific flow (e.g. deposit top-up, which is a
// standalone ledger, not a dues top-up) shouldn't show the generic
// "Adding top-up…" wording on the global loading overlay while doing
// something conceptually different — see BulkTopUpModal.jsx.
describe('BulkTopUpModal — actionNoun override', () => {
  it('defaults every message to "top-up" when actionNoun is not provided', async () => {
    const onSaved = vi.fn().mockResolvedValue({ count: 1, total: 500 });
    const notify  = vi.fn();
    render(
      <BulkTopUpModal open onClose={vi.fn()} entities={SALESPEOPLE} onSaved={onSaved} notify={notify} />
    );
    pickAndContinue(['K Pandu']);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Add top-up/i }));

    expect(notify).toHaveBeenCalledWith('Adding top-up…', 'loading');
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Top-up added for 1 salesperson', 'success'));
  });

  it('carries a custom actionNoun through the button, loading and success text', async () => {
    const onSaved = vi.fn().mockResolvedValue({ count: 2, total: 40000 });
    const notify  = vi.fn();
    render(
      <BulkTopUpModal
        open
        onClose={vi.fn()}
        entities={SALESPEOPLE}
        onSaved={onSaved}
        notify={notify}
        actionNoun="deposit top-up"
      />
    );
    pickAndContinue(['K Pandu', 'Mahesh']);
    const inputs = screen.getAllByPlaceholderText('0.00');
    fireEvent.change(inputs[0], { target: { value: '20000' } });
    fireEvent.change(inputs[1], { target: { value: '20000' } });

    const submit = screen.getByRole('button', { name: /Add deposit top-up/i });
    fireEvent.click(submit);

    expect(notify).toHaveBeenCalledWith('Adding deposit top-up…', 'loading');
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Deposit top-up added for 2 salespeople', 'success')
    );
  });

  it('carries a custom actionNoun into the error toast on failure', async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error('boom'));
    const notify  = vi.fn();
    render(
      <BulkTopUpModal
        open
        onClose={vi.fn()}
        entities={SALESPEOPLE}
        onSaved={onSaved}
        notify={notify}
        actionNoun="deposit top-up"
      />
    );
    pickAndContinue(['K Pandu']);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Add deposit top-up/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Failed to add deposit top-up', 'error')
    );
  });
});
