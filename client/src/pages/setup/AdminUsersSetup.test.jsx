/**
 * AdminUsersSetup tests.
 *
 * Covers listing/search, role/status badges, the add/edit/delete flows, the
 * "password blank keeps current" edit behaviour, and the self-protection
 * guards (can't delete or demote/deactivate your own account).
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminUsersSetup from './AdminUsersSetup';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { adminUserId: 1 } }),
}));

function adminUser(overrides) {
  return { id: 2, username: 'raghav', role: 'admin', isActive: true, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
});

async function renderPage() {
  const utils = render(<AdminUsersSetup />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin-users'));
  return utils;
}

describe('AdminUsersSetup — list', () => {
  it('shows "No admin users found" when empty', async () => {
    await renderPage();
    expect(await screen.findByText('No admin users found')).toBeInTheDocument();
  });

  it('lists users with role and status badges', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ role: 'superadmin', isActive: false })] },
    });
    await renderPage();
    expect(await screen.findByText('raghav')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows the Dispatcher badge for a dispatcher-role row', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ role: 'dispatcher', username: 'dispatcher1' })] },
    });
    await renderPage();
    expect(await screen.findByText('dispatcher1')).toBeInTheDocument();
    expect(screen.getByText('Dispatcher')).toBeInTheDocument();
  });

  it('filters by username or role', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ id: 2, username: 'raghav' }), adminUser({ id: 3, username: 'mahesh' })] },
    });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.change(screen.getByPlaceholderText(/Search by username or role/i), { target: { value: 'mahesh' } });
    expect(screen.getByText('mahesh')).toBeInTheDocument();
    expect(screen.queryByText('raghav')).toBeNull();
  });

  it('the X button clears the search and restores the full list', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ id: 2, username: 'raghav' }), adminUser({ id: 3, username: 'mahesh' })] },
    });
    await renderPage();
    await screen.findByText('raghav');
    const input = screen.getByPlaceholderText(/Search by username or role/i);
    fireEvent.change(input, { target: { value: 'mahesh' } });
    expect(screen.queryByText('raghav')).toBeNull();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(screen.getByText('raghav')).toBeInTheDocument();
  });
});

describe('AdminUsersSetup — add user', () => {
  it('disables Create until both username and password are filled', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    const createBtn = screen.getByRole('button', { name: /Create/i });
    expect(createBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'newadmin' } });
    expect(createBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'secret1' } });
    expect(createBtn).not.toBeDisabled();
  });

  it('posts the new user and refreshes the list on success', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'newadmin' } });
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin-users', { username: 'newadmin', password: 'secret1', role: 'admin' })
    );
    // ROLE_LABEL['admin'] is 'Admin', so the message is 'Admin created successfully'
    expect(notify).toHaveBeenCalledWith('Admin created successfully', 'success');
  });

  it('shows the server error on a failed create', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Username already taken' } } });
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'dup' } });
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Username already taken', 'error'));
  });

  it('the role select offers Dispatcher, and creating one posts role: dispatcher', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'dispatcher1' } });
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByDisplayValue('Admin'), { target: { value: 'dispatcher' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin-users', { username: 'dispatcher1', password: 'secret1', role: 'dispatcher' })
    );
  });

  it('falls back to a generic error message when create fails with no server error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'newadmin' } });
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('the eye button toggles the new-password field between hidden and visible text', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    const pwInput = screen.getByPlaceholderText(/Min 6 characters/);
    expect(pwInput).toHaveAttribute('type', 'password');

    fireEvent.click(pwInput.parentElement.querySelector('button'));
    expect(pwInput).toHaveAttribute('type', 'text');
  });

  it('Cancel closes the Add User modal without posting', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.change(screen.getByPlaceholderText(/john_admin/), { target: { value: 'newadmin' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText(/john_admin/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('the X (close dialog) button also dismisses the Add User modal', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Add User'));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByPlaceholderText(/john_admin/)).not.toBeInTheDocument();
  });
});

describe('AdminUsersSetup — toggle active', () => {
  it('disables the toggle for your own account', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 1, username: 'me' })] } });
    await renderPage();
    await screen.findByText('me');
    const row = screen.getByText('me').closest('tr');
    const [toggleBtn] = within(row).getAllByRole('button');
    expect(toggleBtn).toBeDisabled();
  });

  it('calls PUT and notifies with role label on enable/disable', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ id: 5, username: 'raghav', role: 'admin', isActive: true })] },
    });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [toggleBtn] = within(row).getAllByRole('button');
    fireEvent.click(toggleBtn);

    // Toggling opens a confirmation dialog first — the PUT only fires once confirmed.
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin-users/5', { username: 'raghav', role: 'admin', isActive: false })
    );
    // isActive was true → disabling → 'Admin "raghav" disabled'
    expect(notify).toHaveBeenCalledWith('Admin "raghav" disabled', 'success');
  });

  it('shows an error notification when the toggle fails', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Cannot disable last admin' } } });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ id: 5, username: 'raghav' })] },
    });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [toggleBtn] = within(row).getAllByRole('button');
    fireEvent.click(toggleBtn);

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Cannot disable last admin', 'error'));
  });

  it('closing the confirmation dialog without confirming does not toggle', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [adminUser({ id: 5, username: 'raghav', isActive: true })] },
    });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [toggleBtn] = within(row).getAllByRole('button');
    fireEvent.click(toggleBtn);

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('AdminUsersSetup — edit user', () => {
  it('opens prefilled with the username, leaving the password field blank', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav', role: 'admin' })] } });
    await renderPage();
    await screen.findByText('raghav');

    const row = screen.getByText('raghav').closest('tr');
    // Row buttons: [toggleActive, edit, delete] — edit is index 1
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);

    expect(screen.getByText('Edit — raghav')).toBeInTheDocument();
    expect(screen.getByDisplayValue('raghav')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Min 6 characters/)).toHaveValue('');
  });

  it('omits password from the payload when left blank', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');

    const row = screen.getByText('raghav').closest('tr');
    // Row buttons: [toggleActive, edit, delete] — edit is index 1
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin-users/5', { username: 'raghav', role: 'admin', isActive: true })
    );
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('password');
  });

  it('includes password in the payload when one is entered', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');

    const row = screen.getByText('raghav').closest('tr');
    // Row buttons: [toggleActive, edit, delete] — edit is index 1
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);
    fireEvent.change(screen.getByPlaceholderText(/Min 6 characters/), { target: { value: 'newpass1' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin-users/5', {
        username: 'raghav', role: 'admin', isActive: true, password: 'newpass1',
      })
    );
  });

  it('notifies with role label and username on successful update', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav', role: 'admin' })] } });
    await renderPage();
    await screen.findByText('raghav');

    const row = screen.getByText('raghav').closest('tr');
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    // ROLE_LABEL['admin'] is 'Admin', so the message is 'Admin "raghav" updated'
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Admin "raghav" updated', 'success'));
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Duplicate username' } } });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Duplicate username', 'error'));

    vi.mocked(api.put).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });

  it('the eye button toggles the edit-password field visibility', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.click(within(screen.getByText('raghav').closest('tr')).getAllByRole('button')[1]);

    const pwInput = screen.getByPlaceholderText(/Min 6 characters/);
    expect(pwInput).toHaveAttribute('type', 'password');
    fireEvent.click(pwInput.parentElement.querySelector('button'));
    expect(pwInput).toHaveAttribute('type', 'text');
  });

  it('the Active toggle flips isActive, included in the save payload', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav', isActive: true })] } });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.click(within(screen.getByText('raghav').closest('tr')).getAllByRole('button')[1]);

    // Active toggle is the lone unlabeled button inside the modal footer-less form area.
    const dialog = screen.getByRole('dialog');
    const activeToggle = within(dialog).getByText('Active').nextElementSibling;
    fireEvent.click(activeToggle);
    fireEvent.click(within(dialog).getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin-users/5', {
      username: 'raghav', role: 'admin', isActive: false,
    }));
  });

  it('Cancel closes the Edit modal without saving', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.click(within(screen.getByText('raghav').closest('tr')).getAllByRole('button')[1]);
    expect(screen.getByText('Edit — raghav')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Edit — raghav')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('the X (close dialog) button also dismisses the Edit modal', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.click(within(screen.getByText('raghav').closest('tr')).getAllByRole('button')[1]);
    expect(screen.getByText('Edit — raghav')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Edit — raghav')).not.toBeInTheDocument();
  });

  it('editing the username field and role select updates the save payload', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav', role: 'admin' })] } });
    await renderPage();
    await screen.findByText('raghav');
    fireEvent.click(within(screen.getByText('raghav').closest('tr')).getAllByRole('button')[1]);

    fireEvent.change(screen.getByDisplayValue('raghav'), { target: { value: 'raghav2' } });
    fireEvent.change(screen.getByDisplayValue('Admin'), { target: { value: 'superadmin' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin-users/5', {
      username: 'raghav2', role: 'superadmin', isActive: true,
    }));
  });

  it('disables the role select and active toggle when editing your own account', async () => {
    // useAuth mock's adminUserId is 1 — this user IS the logged-in admin.
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 1, username: 'me' })] } });
    await renderPage();
    await screen.findByText('me');

    const row = screen.getByText('me').closest('tr');
    // Row buttons: [toggleActive (disabled for self), edit, delete (disabled for self)]
    // Edit is index 1 — it's always enabled so you can still open the modal to view
    const [, editBtn] = within(row).getAllByRole('button');
    fireEvent.click(editBtn);

    expect(screen.getByDisplayValue('Admin')).toBeDisabled();
  });
});

describe('AdminUsersSetup — delete user', () => {
  it('disables the delete button for your own account', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 1, username: 'me' })] } });
    await renderPage();
    await screen.findByText('me');
    const row = screen.getByText('me').closest('tr');
    // Row buttons: [toggleActive (disabled for self), edit, delete (disabled for self)]
    const [,, deleteBtn] = within(row).getAllByRole('button');
    expect(deleteBtn).toBeDisabled();
  });

  it('confirms before deleting another admin', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    // Row buttons: [toggleActive, edit, delete] — delete is index 2
    const [,, deleteBtn] = within(row).getAllByRole('button');
    fireEvent.click(deleteBtn);

    expect(await screen.findByText('Delete admin user?')).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin-users/5'));
    // ROLE_LABEL['admin'] is 'Admin', so the message is 'Admin "raghav" deleted'
    expect(notify).toHaveBeenCalledWith('Admin "raghav" deleted', 'success');
  });

  it('Cancel closes the confirmation modal without deleting', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [,, deleteBtn] = within(row).getAllByRole('button');
    fireEvent.click(deleteBtn);
    await screen.findByText('Delete admin user?');

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete admin user?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('the X (close dialog) button also dismisses the delete confirmation', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [,, deleteBtn] = within(row).getAllByRole('button');
    fireEvent.click(deleteBtn);
    await screen.findByText('Delete admin user?');

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Delete admin user?')).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [adminUser({ id: 5, username: 'raghav' })] } });
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'In use' } } });
    await renderPage();
    await screen.findByText('raghav');
    const row = screen.getByText('raghav').closest('tr');
    const [,, deleteBtn] = within(row).getAllByRole('button');
    fireEvent.click(deleteBtn);
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('In use', 'error'));

    vi.mocked(api.delete).mockRejectedValue(new Error('network down'));
    fireEvent.click(deleteBtn);
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Something went wrong', 'error'));
  });
});

describe('AdminUsersSetup — tabs', () => {
  it('starts on the Admin Users tab by default', async () => {
    await renderPage();
    // Search input and user table are visible on the default tab
    expect(screen.getByPlaceholderText(/Search by username or role/i)).toBeInTheDocument();
    // PIN form is NOT visible yet
    expect(screen.queryByText('Change Edit PIN')).not.toBeInTheDocument();
  });

  it('switching to the PIN tab shows the Change Edit PIN button (not inline form)', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    // The card shows a "Change Edit PIN" button (no inline digit inputs visible yet)
    expect(await screen.findByRole('button', { name: /Change Edit PIN/i })).toBeInTheDocument();
    // Users list is gone
    expect(screen.queryByPlaceholderText(/Search by username or role/i)).not.toBeInTheDocument();
  });

  it('hides the Add User button when on the PIN tab', async () => {
    await renderPage();
    expect(screen.getByText('Add User')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    expect(screen.queryByText('Add User')).not.toBeInTheDocument();
  });

  it('switching back to Admin Users tab restores the user list', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Admin Users/i }));
    expect(screen.getByPlaceholderText(/Search by username or role/i)).toBeInTheDocument();
    // Change Edit PIN button no longer visible (on different tab)
    expect(screen.queryByRole('button', { name: /Change Edit PIN/i })).not.toBeInTheDocument();
  });

  it('PIN tab: clicking "Change Edit PIN" button opens the modal', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    const changeBtn = await screen.findByRole('button', { name: /Change Edit PIN/i });
    // Modal (with digit inputs) is NOT visible before clicking the button
    expect(screen.queryByText('Current PIN')).not.toBeInTheDocument();
    fireEvent.click(changeBtn);
    // Modal should now show the PIN form
    expect(await screen.findByText('Current PIN')).toBeInTheDocument();
    expect(screen.getByText('New PIN (6 digits)')).toBeInTheDocument();
  });

  it('PIN tab: Change PIN submit button is disabled until all 18 digits are filled', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    const changeBtn = await screen.findByRole('button', { name: /Change Edit PIN/i });
    fireEvent.click(changeBtn);
    await screen.findByText('Current PIN');
    expect(screen.getByRole('button', { name: /Change PIN/i })).toBeDisabled();
  });

  it('PIN tab: does not call PUT while any digit box is unfilled', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    const changeBtn = await screen.findByRole('button', { name: /Change Edit PIN/i });
    fireEvent.click(changeBtn);
    await screen.findByText('Current PIN');
    // The Change PIN button is disabled so clicking it must not call PUT
    fireEvent.click(screen.getByRole('button', { name: /Change PIN/i }));
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('AdminUsersSetup — P&L PIN toggle', () => {
  // Helper to navigate to the PIN tab, waiting for both settings sections to appear.
  async function openPinTab() {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Edit PIN/i }));
    // Wait for the Change Edit PIN button (card is rendered)
    await screen.findByRole('button', { name: /Change Edit PIN/i });
    // Wait for PlPinToggleSection to finish loading its setting.
    return screen.findByText('Profit & Loss PIN Gate');
  }

  beforeEach(() => {
    // Mock settings endpoint to return "enabled" by default for toggle tests.
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings'))
        return Promise.resolve({ data: { data: { plPinEnabled: true } } });
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('renders the P&L PIN Gate card in the PIN tab', async () => {
    await openPinTab();
    expect(screen.getByText('Profit & Loss PIN Gate')).toBeInTheDocument();
    expect(screen.getByText(/Require PIN for Profit/)).toBeInTheDocument();
  });

  it('shows "Admins must enter the PIN" label when gate is enabled', async () => {
    await openPinTab();
    expect(screen.getByText('Admins must enter the PIN to view P&L data.')).toBeInTheDocument();
  });

  it('shows "open to all admins" label when gate is disabled', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings'))
        return Promise.resolve({ data: { data: { plPinEnabled: false } } });
      return Promise.resolve({ data: { data: [] } });
    });
    await openPinTab();
    expect(screen.getByText('P&L report is open to all admins without a PIN.')).toBeInTheDocument();
  });

  it('calls PUT /pin/settings with false when toggling off', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    await openPinTab();

    const toggle = screen.getByRole('button', { name: /Disable P&L PIN gate/i });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/pin/settings', { plPinEnabled: false })
    );
  });

  it('calls PUT /pin/settings with true when toggling on', async () => {
    // Start with gate disabled
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings'))
        return Promise.resolve({ data: { data: { plPinEnabled: false } } });
      return Promise.resolve({ data: { data: [] } });
    });
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    await openPinTab();

    const toggle = screen.getByRole('button', { name: /Enable P&L PIN gate/i });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/pin/settings', { plPinEnabled: true })
    );
  });

  it('shows a success notification after toggling', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    await openPinTab();

    fireEvent.click(screen.getByRole('button', { name: /Disable P&L PIN gate/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/disabled/i), 'success'));
  });

  it('shows an error notification when the PUT fails', async () => {
    vi.mocked(api.put).mockRejectedValue({ response: { data: { error: 'Forbidden' } } });
    await openPinTab();

    fireEvent.click(screen.getByRole('button', { name: /Disable P&L PIN gate/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Forbidden', 'error'));
  });

  it('shows the "Set P&L PIN" button in the P&L toggle section', async () => {
    await openPinTab();
    expect(screen.getByRole('button', { name: /Set P&L PIN/i })).toBeInTheDocument();
  });

  it('clicking "Set P&L PIN" opens the P&L PIN change modal', async () => {
    await openPinTab();
    // Modal digit inputs NOT visible before clicking
    expect(screen.queryAllByText('Current PIN').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Set P&L PIN/i }));
    expect(await screen.findByText('Current PIN')).toBeInTheDocument();
    expect(screen.getByText('New PIN (6 digits)')).toBeInTheDocument();
  });

  it('P&L PIN modal contains the Change PIN submit button (disabled when empty)', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    await openPinTab();
    fireEvent.click(screen.getByRole('button', { name: /Set P&L PIN/i }));
    await screen.findByText('Current PIN');
    // The submit button is disabled when no digits are filled
    expect(screen.getByRole('button', { name: /Change PIN/i })).toBeDisabled();
  });

  it('P&L PIN modal fills all digits and calls PUT /pin/update-pl on submit', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
    await openPinTab();
    fireEvent.click(screen.getByRole('button', { name: /Set P&L PIN/i }));
    await screen.findByText('Current PIN');

    // Fill all 18 PIN digits via keyDown events (inputs are type=password with onKeyDown handler)
    const pwdInputs = document.querySelectorAll('input[type="password"]');
    pwdInputs.forEach((inp) => {
      fireEvent.keyDown(inp, { key: '1' });
    });

    // Submit button should now be enabled; click it
    const submitBtn = screen.getByRole('button', { name: /Change PIN/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/pin/update-pl', expect.objectContaining({
        currentPin: expect.any(String),
        newPin: expect.any(String),
      }))
    );
  });
});
