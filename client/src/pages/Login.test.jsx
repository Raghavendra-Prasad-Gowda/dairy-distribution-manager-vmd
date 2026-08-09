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

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, user: null }),
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
