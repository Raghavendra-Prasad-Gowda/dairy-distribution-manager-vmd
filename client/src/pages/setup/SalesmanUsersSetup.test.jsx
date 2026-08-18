/**
 * SalesmanUsersSetup tests.
 *
 * Actual pointer-drag reordering (dnd-kit) isn't practical to simulate in
 * jsdom, so the drag itself is out of scope — "Save Order" is still covered
 * using the list's initial (undragged) order. Everything else is covered:
 * listing/search, the add form's username/password cross-validation and
 * optional-field omission, the credentials modal's diff-only payload and
 * "no changes" guard, the active/inactive toggle's optimistic update, and
 * the delete confirmation flow.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanUsersSetup from './SalesmanUsersSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

function salesperson(overrides) {
  return { id: 1, name: 'Ramu K', phone: '9900011122', route: 'North Zone', username: 'ramu.k', isActive: true, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
});

async function renderPage() {
  const utils = render(<SalesmanUsersSetup />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/salespeople?all=true'));
  return utils;
}

describe('SalesmanUsersSetup — list', () => {
  it('shows the empty state when there are no salespeople', async () => {
    await renderPage();
    expect(await screen.findByText(/No salespeople yet/)).toBeInTheDocument();
  });

  it('lists salespeople with route/phone and a login badge', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    expect(await screen.findByText('Ramu K')).toBeInTheDocument();
    expect(screen.getByText('North Zone')).toBeInTheDocument();
    expect(screen.getByText('9900011122')).toBeInTheDocument();
    expect(screen.getByText('@ramu.k')).toBeInTheDocument();
  });

  it('shows "No login" for a salesperson without a username', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ username: null })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    expect(screen.getByText('No login')).toBeInTheDocument();
  });

  it('filters by name, route, phone, or username', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [salesperson({ id: 1, name: 'Ramu K' }), salesperson({ id: 2, name: 'Suresh M', route: 'South Zone', username: 'suresh.m' })] },
    });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.change(screen.getByPlaceholderText(/Search by name, route, phone or username/i), { target: { value: 'south' } });
    expect(screen.getByText('Suresh M')).toBeInTheDocument();
    expect(screen.queryByText('Ramu K')).toBeNull();
  });

  it('the X button clears the search and restores the full list', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [salesperson({ id: 1, name: 'Ramu K' }), salesperson({ id: 2, name: 'Suresh M', route: 'South Zone' })] },
    });
    await renderPage();
    await screen.findByText('Ramu K');
    const input = screen.getByPlaceholderText(/Search by name, route, phone or username/i);
    fireEvent.change(input, { target: { value: 'south' } });
    expect(screen.queryByText('Ramu K')).toBeNull();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(screen.getByText('Ramu K')).toBeInTheDocument();
  });
});

describe('SalesmanUsersSetup — add salesperson', () => {
  it('warns when a username is set without a password', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. ramu.k'), { target: { value: 'newguy' } });
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));

    expect(notify).toHaveBeenCalledWith('Password is required when setting a username', 'warning');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('warns when a password is set without a username', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.change(screen.getByPlaceholderText('Min 6 characters'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));

    expect(notify).toHaveBeenCalledWith('Username is required when setting a password', 'warning');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('omits phone/route from the payload when left blank', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload.name).toBe('New Guy');
    expect(payload.phone).toBeUndefined();
    expect(payload.route).toBeUndefined();
    expect(payload.username).toBeUndefined();
  });

  it('includes username/password together when both are filled, then refreshes the list', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. ramu.k'), { target: { value: 'newguy' } });
    fireEvent.change(screen.getByPlaceholderText('Min 6 characters'), { target: { value: 'secret1' } });
    const getCallsBefore = api.get.mock.calls.length;
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/salespeople', { name: 'New Guy', phone: undefined, route: undefined, username: 'newguy', password: 'secret1' })
    );
    expect(notify).toHaveBeenCalledWith('Salesperson added', 'success');
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(getCallsBefore));
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Name is required' } } });
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Name is required', 'error'));

    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByText('Add Salesperson', { selector: 'button[type="submit"]' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to add salesperson', 'error'));
  });

  it('the eye button toggles the new-password field visibility', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    const pwInput = screen.getByPlaceholderText('Min 6 characters');
    expect(pwInput).toHaveAttribute('type', 'password');

    fireEvent.click(pwInput.parentElement.querySelector('button'));
    expect(pwInput).toHaveAttribute('type', 'text');
  });

  it('Cancel and the X button both close the Add modal without posting', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Ramu'), { target: { value: 'New Guy' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('e.g. Ramu')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Add Salesperson'));
    fireEvent.click(screen.getByText('New Salesperson').closest('div.bg-emerald-800').querySelector('button'));
    expect(screen.queryByPlaceholderText('e.g. Ramu')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('SalesmanUsersSetup — active toggle', () => {
  it('PUTs the flipped flag and updates locally, with a success toast', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ isActive: true })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    const getCallsBefore = api.get.mock.calls.length;

    fireEvent.click(screen.getByText('Disable'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/salespeople/1', { isActive: false }));
    expect(notify).toHaveBeenCalledWith('Salesperson deactivated', 'success');
    expect(screen.getByText('Enable')).toBeInTheDocument();
    // No extra GETs — the toggle updates React state directly.
    expect(api.get.mock.calls.length).toBe(getCallsBefore);
  });

  it('shows an error notification when the toggle fails', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ isActive: true })] } });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Cannot disable' } } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByText('Disable'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Cannot disable', 'error'));
  });
});

describe('SalesmanUsersSetup — edit credentials', () => {
  it('prefills the username and leaves password fields blank', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ username: 'ramu.k' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));

    expect(screen.getByText('Login Credentials')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ramu.k')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Leave blank to keep existing')).toHaveValue('');
  });

  it('warns when password and confirm password do not match', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));

    fireEvent.change(screen.getByPlaceholderText('Leave blank to keep existing'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('Repeat new password'), { target: { value: 'secret2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));

    expect(notify).toHaveBeenCalledWith('Passwords do not match', 'warning');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('warns "No changes to save" when nothing was edited', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));

    expect(notify).toHaveBeenCalledWith('No changes to save', 'warning');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('sends only the changed username when password is left blank', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 3, username: 'ramu.k' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));

    fireEvent.change(screen.getByDisplayValue('ramu.k'), { target: { value: 'ramu.new' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/salespeople/3', { username: 'ramu.new' }));
    expect(notify).toHaveBeenCalledWith('Credentials updated', 'success');
  });

  it('includes the password when both password and confirm match', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 3, username: 'ramu.k' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));

    fireEvent.change(screen.getByPlaceholderText('Leave blank to keep existing'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('Repeat new password'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/salespeople/3', { password: 'secret1' }));
  });

  it('the eye button toggles both password and confirm fields together', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));

    const pwInput = screen.getByPlaceholderText('Leave blank to keep existing');
    const confirmInput = screen.getByPlaceholderText('Repeat new password');
    expect(pwInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('type', 'password');

    fireEvent.click(pwInput.parentElement.querySelector('button'));
    expect(pwInput).toHaveAttribute('type', 'text');
    expect(confirmInput).toHaveAttribute('type', 'text');
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 3, username: 'ramu.k' })] } });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Username taken' } } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));
    fireEvent.change(screen.getByDisplayValue('ramu.k'), { target: { value: 'ramu.new' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Username taken', 'error'));

    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: /Save Credentials/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to update credentials', 'error'));
  });

  it('Cancel and the X button both close the credentials modal without saving', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Edit credentials'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Login Credentials')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Edit credentials'));
    fireEvent.click(screen.getByText('Login Credentials').closest('div.bg-emerald-800').querySelector('button'));
    expect(screen.queryByText('Login Credentials')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('SalesmanUsersSetup — delete', () => {
  it('asks for confirmation, then deletes and refreshes the list', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 9, name: 'Ramu K' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Delete salesperson'));

    expect(await screen.findByText('Delete Ramu K?')).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    const getCallsBefore = api.get.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/salespeople/9'));
    expect(notify).toHaveBeenCalledWith('Salesperson deleted', 'success');
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(getCallsBefore));
  });

  it('cancels without deleting', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 9, name: 'Ramu K' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Delete salesperson'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Delete Ramu K?')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 9, name: 'Ramu K' })] } });
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'In use' } } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByTitle('Delete salesperson'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('In use', 'error'));

    vi.mocked(api.delete).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByTitle('Delete salesperson'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to delete', 'error'));
  });
});

describe('SalesmanUsersSetup — reorder mode', () => {
  it('enters reorder mode, hiding search/table and showing draggable rows', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 1, name: 'Ramu K' }), salesperson({ id: 2, name: 'Suresh M' })] } });
    await renderPage();
    await screen.findByText('Ramu K');

    fireEvent.click(screen.getByText('Reorder'));

    expect(screen.getByText('Save Order')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search by name, route, phone or username/i)).toBeNull();
    expect(screen.getByText('Ramu K')).toBeInTheDocument();
    expect(screen.getByText('Suresh M')).toBeInTheDocument();
  });

  it('cancelling reorder mode makes no API call and restores the normal view', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson()] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByText('Reorder'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByPlaceholderText(/Search by name, route, phone or username/i)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('saving the (undragged) order PUTs 0-based displayOrder and exits reorder mode', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 1, name: 'Ramu K' }), salesperson({ id: 2, name: 'Suresh M' })] } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByText('Reorder'));
    fireEvent.click(screen.getByText('Save Order'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/salespeople/reorder', [
        { id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 },
      ])
    );
    expect(notify).toHaveBeenCalledWith('Display order saved', 'success');
    await waitFor(() => expect(screen.getByPlaceholderText(/Search by name, route, phone or username/i)).toBeInTheDocument());
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [salesperson({ id: 1, name: 'Ramu K' })] } });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Order locked' } } });
    await renderPage();
    await screen.findByText('Ramu K');
    fireEvent.click(screen.getByText('Reorder'));
    fireEvent.click(screen.getByText('Save Order'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Order locked', 'error'));
    // Stays in reorder mode so the admin can retry.
    expect(screen.getByText('Save Order')).toBeInTheDocument();

    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByText('Save Order'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to save order', 'error'));
  });
});
