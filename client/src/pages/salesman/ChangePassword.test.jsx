/**
 * ChangePassword tests.
 *
 * Covers the live password-strength checklist, the confirm-match indicator,
 * the submit button's enabled/disabled state, the three pre-submit guard
 * warnings (reachable via Enter even though the button is disabled), the
 * show/hide toggles, and the success/failure API flow.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChangePassword from './ChangePassword';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { post: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'mahesh' } }),
}));

beforeEach(() => {
  vi.resetAllMocks(); // clearAllMocks alone would leak a mockRejectedValue set by an earlier test
});

function fields() {
  return {
    current: screen.getByPlaceholderText('Enter current password'),
    next:    screen.getByPlaceholderText('Enter new password'),
    confirm: screen.getByPlaceholderText('Confirm new password'),
  };
}

describe('ChangePassword — strength checklist', () => {
  it('starts with every requirement unmet', () => {
    render(<ChangePassword />);
    expect(screen.getByText('At least 8 characters').className).toContain('text-slate-500');
  });

  it('checks off requirements as they are satisfied', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });

    expect(screen.getByText('At least 8 characters').className).toContain('text-emerald-700');
    expect(screen.getByText('One uppercase letter (A-Z)').className).toContain('text-emerald-700');
    expect(screen.getByText('One lowercase letter (a-z)').className).toContain('text-emerald-700');
    expect(screen.getByText('One number (0-9)').className).toContain('text-emerald-700');
  });

  it('leaves an unmet requirement unchecked', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().next, { target: { value: 'abcdefgh' } }); // no uppercase, no number
    expect(screen.getByText('One uppercase letter (A-Z)').className).toContain('text-slate-500');
    expect(screen.getByText('One number (0-9)').className).toContain('text-slate-500');
  });
});

describe('ChangePassword — confirm match indicator', () => {
  it('shows "do not match" while the confirm field disagrees', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    fireEvent.change(fields().confirm, { target: { value: 'Different1' } });
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows "match" once the confirm field agrees', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    fireEvent.change(fields().confirm, { target: { value: 'Abcdefg1' } });
    expect(screen.getByText('Passwords match')).toBeInTheDocument();
  });
});

describe('ChangePassword — submit gating', () => {
  it('disables the submit button until current password, strength, and match are all satisfied', () => {
    render(<ChangePassword />);
    const button = screen.getByRole('button', { name: /Update Password/i });
    expect(button).toBeDisabled();

    fireEvent.change(fields().current, { target: { value: 'oldpass' } });
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    expect(button).toBeDisabled(); // confirm not filled yet

    fireEvent.change(fields().confirm, { target: { value: 'Abcdefg1' } });
    expect(button).not.toBeDisabled();
  });

  it('warns instead of submitting when current password is empty (submitted via Enter)', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    fireEvent.change(fields().confirm, { target: { value: 'Abcdefg1' } });
    fireEvent.submit(screen.getByRole('button', { name: /Update Password/i }).closest('form'));

    expect(notify).toHaveBeenCalledWith('Enter current password', 'warning');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('warns when the new password does not meet requirements', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().current, { target: { value: 'oldpass' } });
    fireEvent.change(fields().next, { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('button', { name: /Update Password/i }).closest('form'));

    expect(notify).toHaveBeenCalledWith('Password does not meet requirements', 'warning');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('warns when the confirmation does not match', () => {
    render(<ChangePassword />);
    fireEvent.change(fields().current, { target: { value: 'oldpass' } });
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    fireEvent.change(fields().confirm, { target: { value: 'Mismatch1' } });
    fireEvent.submit(screen.getByRole('button', { name: /Update Password/i }).closest('form'));

    expect(notify).toHaveBeenCalledWith('New passwords do not match', 'warning');
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('ChangePassword — submit flow', () => {
  async function fillValidForm() {
    fireEvent.change(fields().current, { target: { value: 'oldpass' } });
    fireEvent.change(fields().next, { target: { value: 'Abcdefg1' } });
    fireEvent.change(fields().confirm, { target: { value: 'Abcdefg1' } });
  }

  it('posts the current/new password and clears the form on success', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    render(<ChangePassword />);
    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'oldpass', newPassword: 'Abcdefg1',
      })
    );
    expect(notify).toHaveBeenCalledWith('Password changed successfully', 'success');
    expect(fields().current).toHaveValue('');
    expect(fields().next).toHaveValue('');
    expect(fields().confirm).toHaveValue('');
  });

  it('shows the server error and keeps the user on the page when the current password is wrong', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });
    render(<ChangePassword />);
    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Current password is incorrect', 'error'));
    // Form is not cleared on failure, unlike on success.
    expect(fields().current).toHaveValue('oldpass');
  });
});

describe('ChangePassword — show/hide toggles', () => {
  it('toggles the current password field between hidden and visible', () => {
    render(<ChangePassword />);
    const input = fields().current;
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveAttribute('type', 'text');
  });
});
