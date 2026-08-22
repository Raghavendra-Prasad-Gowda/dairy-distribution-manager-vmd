/**
 * Login page tests.
 *
 * Covers the wrong-password path specifically: the error must stay on
 * screen (already covered at the axios-interceptor level in
 * api/axios.test.js) and the password field must be cleared so the user
 * isn't staring at — or blindly resubmitting — the same rejected value.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Login from './Login';

const mockLogin = vi.fn();
const mockVerifyMfa = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, verifyMfa: mockVerifyMfa, user: null }),
}));

vi.mock('../api/coldStart', () => ({
  armForLogin: vi.fn(),
}));

vi.mock('../utils/session', () => ({
  consumeSessionNotice: vi.fn(() => ''),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillAndSubmit(username, password) {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('Login — wrong password', () => {
  it('clears the password field but keeps the username and the error message', async () => {
    mockLogin.mockResolvedValue({ success: false, message: 'Invalid username or password' });
    render(<Login />);

    await fillAndSubmit('raghav', 'wrong-password');

    await waitFor(() => expect(screen.getByText('Invalid username or password')).toBeInTheDocument());
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
    expect(screen.getByLabelText(/username/i)).toHaveValue('raghav');
  });

  it('does not touch the password field on a successful login', async () => {
    mockLogin.mockResolvedValue({ success: true });
    render(<Login />);

    await fillAndSubmit('raghav', 'correct-password');

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('raghav', 'correct-password'));
    expect(screen.queryByText(/invalid/i)).toBeNull();
  });
});

describe('Login — MFA step (superadmin)', () => {
  it('switches to the code-entry screen when login() reports mfaRequired', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');

    await waitFor(() => expect(screen.getByText('Two-factor authentication')).toBeInTheDocument());
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument();
  });

  it('calls verifyMfa with the mfaToken and entered code, then does not show an error on success', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    mockVerifyMfa.mockResolvedValue({ success: true });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');
    await screen.findByText('Two-factor authentication');

    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => expect(mockVerifyMfa).toHaveBeenCalledWith('pending-token', '123456'));
    expect(screen.queryByText(/invalid/i)).toBeNull();
  });

  it('shows the server error and clears the code on an incorrect MFA code', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    mockVerifyMfa.mockResolvedValue({ success: false, message: 'Invalid authentication code' });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');
    await screen.findByText('Two-factor authentication');
    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => expect(screen.getByText('Invalid authentication code')).toBeInTheDocument());
    expect(screen.getByLabelText(/authentication code/i)).toHaveValue('');
  });

  it('"Back to login" returns to the username/password form', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');
    await screen.findByText('Two-factor authentication');

    fireEvent.click(screen.getByRole('button', { name: /back to login/i }));

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByText('Two-factor authentication')).not.toBeInTheDocument();
  });

  it('the Verify button is disabled until a code is entered, and never calls verifyMfa while disabled', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');
    await screen.findByText('Two-factor authentication');

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    expect(verifyBtn).toBeDisabled();
    fireEvent.click(verifyBtn);
    expect(mockVerifyMfa).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: '654321' } });
    expect(verifyBtn).not.toBeDisabled();
  });

  it('password is cleared once the MFA step starts, so it is not held in state any longer than needed', async () => {
    mockLogin.mockResolvedValue({ success: false, mfaRequired: true, mfaToken: 'pending-token' });
    render(<Login />);

    await fillAndSubmit('super', 'correct-password');
    await screen.findByText('Two-factor authentication');

    fireEvent.click(screen.getByRole('button', { name: /back to login/i }));
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });
});
