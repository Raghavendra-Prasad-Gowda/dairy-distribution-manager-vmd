/**
 * BrandsSetup — deposit settings regression test.
 *
 * The brand-level deposit toggle + rate used to live here, was removed
 * entirely in a refactor (commit 89eb717, "Remove deposit settings and brand
 * reorder from brand setup"), and there was no test to catch it — the whole
 * feature silently had no UI for two months before anyone noticed. This test
 * exists specifically so that regression can't happen again unnoticed: it
 * fails if the deposit toggle/rate ever disappears from this page.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BrandsSetup from './BrandsSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

let mockRole = 'superadmin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

const BRANDS = [
  { id: 1, name: 'Nandini', isActive: true, depositEnabled: true, depositPerLitre: 2.5 },
  { id: 2, name: 'Jersey',  isActive: true, depositEnabled: false, depositPerLitre: 0 },
];

function mockBrandsList(brands = BRANDS) {
  vi.mocked(api.get).mockResolvedValue({ data: { data: brands } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRole = 'superadmin';
});

async function renderPage() {
  render(<BrandsSetup />);
  await waitFor(() => expect(screen.getByText('Nandini')).toBeInTheDocument());
}

/** Scopes to the Add/Rename modal's own form — its submit button shares text
 * ("Add Brand") with the toolbar button that opens it. */
function addBrandForm() {
  return screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage').closest('form');
}

describe('BrandsSetup — deposit settings', () => {
  it('shows a deposit-enabled brand with its rate as a badge in the list', async () => {
    mockBrandsList();
    await renderPage();
    expect(screen.getByText('₹2.50/L')).toBeInTheDocument();
  });

  it('does not show a deposit badge for a brand with deposit disabled', async () => {
    mockBrandsList();
    await renderPage();
    // Only Nandini's rate should render — nothing for Jersey.
    expect(screen.queryAllByText(/₹.*\/L/)).toHaveLength(1);
  });

  it('offers a "Deposit settings" control per brand for an admin', async () => {
    mockRole = 'admin';
    mockBrandsList();
    await renderPage();
    expect(screen.getAllByTitle('Deposit settings').length).toBe(BRANDS.length);
  });

  it('offers a "Deposit settings" control per brand for a superadmin too', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();
    expect(screen.getAllByTitle('Deposit settings').length).toBe(BRANDS.length);
  });

  it('opens a modal with an enabled toggle and a rate input, pre-filled from the brand', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);

    expect(screen.getByText('Deposit Settings')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(2.5);
  });

  it('disables the rate input when the toggle is switched off', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);
    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
  });

  it('saves depositEnabled and depositPerLitre via PUT /brands/:id', async () => {
    mockBrandsList();
    vi.mocked(api.put).mockResolvedValue({
      data: { data: { id: 2, name: 'Jersey', isActive: true, depositEnabled: true, depositPerLitre: 1.75 } },
    });
    await renderPage();

    // Jersey (index 1) currently has deposit disabled.
    fireEvent.click(screen.getAllByTitle('Deposit settings')[1]);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/2', {
      depositEnabled: true,
      depositPerLitre: 1.75,
    }));
  });

  it('refuses to save when enabling with no rate entered', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[1]); // Jersey — disabled
    fireEvent.click(screen.getByRole('switch')); // turn on, rate stays blank
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).not.toHaveBeenCalled());
  });

  it('cancel closes the deposit modal without saving', async () => {
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);
    expect(screen.getByText('Deposit Settings')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByText('Deposit Settings')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows an error notification when saving deposit settings fails', async () => {
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Server exploded', 'error'));
  });

  it('falls back to a generic error message when the save fails with no server error', async () => {
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('pre-fills an empty rate when the brand has no depositPerLitre set', async () => {
    mockBrandsList([{ id: 1, name: 'Nandini', isActive: true, depositEnabled: false, depositPerLitre: null }]);
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Deposit settings')[0]);

    expect(screen.getByPlaceholderText('0.00')).toHaveValue(null);
  });
});

describe('BrandsSetup — loading and empty states', () => {
  it('shows a loader while brands are being fetched', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {})); // never resolves
    render(<BrandsSetup />);
    // BrandedLoader renders instead of the brand list.
    expect(screen.queryByText('Dairy Brands')).not.toBeInTheDocument();
  });

  it('shows an empty-state message when there are no brands', async () => {
    mockBrandsList([]);
    render(<BrandsSetup />);
    await waitFor(() => expect(screen.getByText('No brands yet — add one above')).toBeInTheDocument());
  });

  it('hides the page header when rendered inside the shell (shellActiveBrandId set)', async () => {
    mockBrandsList();
    render(<BrandsSetup shellActiveBrandId={1} />);
    await waitFor(() => expect(screen.getByText('Nandini')).toBeInTheDocument());
    expect(screen.queryByText('Add, rename and configure deposit for dairy brands')).not.toBeInTheDocument();
  });

  it('shows the page header when not in shell mode', async () => {
    mockBrandsList();
    await renderPage();
    expect(screen.getByText('Add, rename and configure deposit for dairy brands')).toBeInTheDocument();
  });
});

describe('BrandsSetup — role-based visibility', () => {
  it('a superadmin sees Add Brand, rename, enable/disable and archive controls', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    expect(screen.getByText('Add Brand')).toBeInTheDocument();
    expect(screen.getAllByTitle('Rename brand').length).toBe(BRANDS.length);
    expect(screen.getAllByTitle('Disable brand').length).toBe(BRANDS.length);
    expect(screen.getAllByTitle('Archive brand').length).toBe(BRANDS.length);
  });

  it('a plain admin does not see Add Brand, rename, enable/disable or archive controls', async () => {
    mockRole = 'admin';
    mockBrandsList();
    await renderPage();

    expect(screen.queryByText('Add Brand')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Rename brand')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Disable brand')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Archive brand')).not.toBeInTheDocument();
    // Deposit settings remain available to a plain admin.
    expect(screen.getAllByTitle('Deposit settings').length).toBe(BRANDS.length);
  });

  it('the "renaming updates nav links" footnote only shows for a superadmin with brands present', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();
    expect(screen.getByText(/Renaming a brand updates its navigation link/)).toBeInTheDocument();
  });
});

describe('BrandsSetup — add brand', () => {
  it('opens the Add Brand modal with an empty name field', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));

    expect(screen.getByText('Create a new dairy brand')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage')).toHaveValue('');
  });

  it('disables the submit button until a name is entered', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    expect(within(addBrandForm()).getByRole('button', { name: 'Add Brand' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    expect(within(addBrandForm()).getByRole('button', { name: 'Add Brand' })).not.toBeDisabled();
  });

  it('adds a brand with no product copy', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 3, name: 'Heritage', isActive: true } } });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/brands', { name: 'Heritage' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Heritage" added', 'success'));
    // Modal closes and the new brand appears in the list.
    await waitFor(() => expect(screen.getByText('Heritage')).toBeInTheDocument());
  });

  it('offers a "Copy Products From" selector only when other brands already exist', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();
    fireEvent.click(screen.getByText('Add Brand'));
    expect(screen.getByText('Copy Products From')).toBeInTheDocument();
  });

  it('does not offer a copy-from selector when there are no existing brands', async () => {
    mockRole = 'superadmin';
    mockBrandsList([]);
    render(<BrandsSetup />);
    await waitFor(() => expect(screen.getByText('No brands yet — add one above')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add Brand'));
    expect(screen.queryByText('Copy Products From')).not.toBeInTheDocument();
  });

  it('adds a brand and copies products from the selected source brand', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/brands') return Promise.resolve({ data: { data: { id: 3, name: 'Heritage', isActive: true } } });
      return Promise.resolve({ data: { data: { copiedProducts: 5 } } });
    });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    expect(screen.getByText(/All active products and categories will be copied/)).toBeInTheDocument();
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/brands/3/copy-products', { sourceBrandId: 1 }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Heritage" added with 5 products copied', 'success'));
  });

  it('reports singular "1 product copied" correctly', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/brands') return Promise.resolve({ data: { data: { id: 3, name: 'Heritage', isActive: true } } });
      return Promise.resolve({ data: { data: { copiedProducts: 1 } } });
    });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Heritage" added with 1 product copied', 'success'));
  });

  it('still reports the brand as added, with an error notice, when product copy fails', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/brands') return Promise.resolve({ data: { data: { id: 3, name: 'Heritage', isActive: true } } });
      return Promise.reject(new Error('copy failed'));
    });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Heritage" added, but product copy failed', 'error'));
  });

  it('shows an error notification when creating the brand itself fails', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Name already taken' } } });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Nandini' } });
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Name already taken', 'error'));
  });

  it('falls back to a generic error message when the server response has none', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Nandini' } });
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('does not submit when the name is only whitespace', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    const input = screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage');
    fireEvent.change(input, { target: { value: '   ' } });
    // The submit button is disabled for a whitespace-only name — submit the
    // form directly to exercise the handler's own defensive `if (!name)` guard.
    fireEvent.submit(addBrandForm());

    expect(api.post).not.toHaveBeenCalled();
  });

  it('clearing the copy-from selector back to "None" resets it to null', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 3, name: 'Heritage', isActive: true } } });
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(screen.queryByText(/All active products and categories will be copied/)).not.toBeInTheDocument();
    fireEvent.click(within(addBrandForm()).getByRole('button', { name: 'Add Brand' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/brands', { name: 'Heritage' }));
    // No copy-products call since copyFromId reset to null.
    expect(api.post).not.toHaveBeenCalledWith(expect.stringContaining('copy-products'), expect.anything());
  });

  it('cancel closes the Add Brand modal without submitting', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Heritage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Create a new dairy brand')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('the X close button also closes the Add Brand modal', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getByText('Add Brand'));
    const closeButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-x'));
    fireEvent.click(closeButtons[0]);

    expect(screen.queryByText('Create a new dairy brand')).not.toBeInTheDocument();
  });
});

describe('BrandsSetup — rename brand', () => {
  it('opens the rename modal pre-filled with the brand name', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Rename brand')[0]);

    expect(screen.getByText('Update the brand name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage')).toHaveValue('Nandini');
    // No copy-from selector in rename mode.
    expect(screen.queryByText('Copy Products From')).not.toBeInTheDocument();
  });

  it('renames a brand when the name actually changed', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Rename brand')[0]);
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Nandini Dairy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/1', { name: 'Nandini Dairy' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand renamed to "Nandini Dairy"', 'success'));
    await waitFor(() => expect(screen.getByText('Nandini Dairy')).toBeInTheDocument());
  });

  it('does not call the API when the name was not actually changed', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Rename brand')[0]);
    // Re-submit with the same name (just re-typed identically).
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.queryByText('Update the brand name')).not.toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows an error notification when renaming fails', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Rename failed' } } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Rename brand')[0]);
    fireEvent.change(screen.getByPlaceholderText('e.g. Amul, Nandini, Heritage'), { target: { value: 'Nandini Dairy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Rename failed', 'error'));
  });
});

describe('BrandsSetup — enable / disable', () => {
  it('opens a confirmation before disabling an active brand', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Disable brand')[0]);

    expect(screen.getByText('Disable Brand')).toBeInTheDocument();
    expect(screen.getByText(/Disable "Nandini"\?/)).toBeInTheDocument();
  });

  it('disables a brand after confirming', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Disable brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/1', { isActive: false }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Nandini" disabled', 'success'));
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
  });

  it('re-enables a disabled brand, with the confirmation copy reflecting "Enable"', async () => {
    mockRole = 'superadmin';
    mockBrandsList([{ ...BRANDS[0], isActive: false }, BRANDS[1]]);
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Enable brand')[0]);
    expect(screen.getByText('Enable Brand')).toBeInTheDocument();
    expect(screen.getByText(/reappear across the app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/1', { isActive: true }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Nandini" enabled', 'success'));
  });

  it('cancel leaves the brand untouched', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Disable brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Disable Brand')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows an error notification when the toggle fails', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Toggle failed' } } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Disable brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Toggle failed', 'error'));
  });

  it('falls back to a generic error message when the toggle fails with no server error', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Disable brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('a disabled brand shows no rename or deposit-settings controls', async () => {
    mockRole = 'superadmin';
    mockBrandsList([{ ...BRANDS[0], isActive: false }, BRANDS[1]]);
    await renderPage();

    // Only Jersey (still active) gets rename/deposit controls.
    expect(screen.getAllByTitle('Rename brand')).toHaveLength(1);
    expect(screen.getAllByTitle('Deposit settings')).toHaveLength(1);
  });
});

describe('BrandsSetup — archive', () => {
  it('opens a permanent-archive confirmation', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Archive brand')[0]);

    expect(screen.getByText('Archive Brand')).toBeInTheDocument();
    expect(screen.getByText(/cannot be restored/)).toBeInTheDocument();
  });

  it('archives a brand and removes it from the list', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Archive brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/brands/1', { isArchived: true }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Brand "Nandini" archived', 'success'));
    await waitFor(() => expect(screen.queryByText('Nandini')).not.toBeInTheDocument());
    expect(screen.getByText('Jersey')).toBeInTheDocument();
  });

  it('cancel leaves the brand in the list', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Archive brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Archive Brand')).not.toBeInTheDocument();
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows an error notification when archiving fails', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Archive failed' } } });
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Archive brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Archive failed', 'error'));
    // Stays in the list since the archive failed.
    expect(screen.getByText('Nandini')).toBeInTheDocument();
  });

  it('falls back to a generic error message when archiving fails with no server error', async () => {
    mockRole = 'superadmin';
    mockBrandsList();
    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    await renderPage();

    fireEvent.click(screen.getAllByTitle('Archive brand')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});
