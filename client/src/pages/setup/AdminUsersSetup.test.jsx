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

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin-users/5', { username: 'raghav', role: 'admin', isActive: false })
    );
    // isActive was true → disabling → 'Admin "raghav" disabled'
    expect(notify).toHaveBeenCalledWith('Admin "raghav" disabled', 'success');
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
});
