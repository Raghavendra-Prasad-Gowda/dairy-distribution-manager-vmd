/**
 * AuthContext tests.
 *
 * Covers hydrating from localStorage on mount (valid vs. already-expired
 * session), login (success sets storage + the Authorization header,
 * failure surfaces the server's message), logout, and the proactive 2h
 * session-expiry timer that fires performAutoLogout and redirects.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../api/axios';
import { SESSION_MS, expireSessionAndRedirect } from '../utils/session';

vi.mock('../api/axios', () => ({
  default: { post: vi.fn(), defaults: { headers: { common: {} } } },
}));

vi.mock('../utils/session', () => ({
  SESSION_MS: 2 * 60 * 60 * 1000,
  expireSessionAndRedirect: vi.fn(),
}));

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.businessName : 'none'}</span>
      <button onClick={() => login('bob', 'secret')}>do-login</button>
      <button onClick={() => logout()}>do-logout</button>
    </div>
  );
}

function renderProvider() {
  return render(<AuthProvider><Probe /></AuthProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.defaults.headers.common = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthContext — hydration on mount', () => {
  it('starts with no user when localStorage is empty', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('restores the user from a still-valid stored session', async () => {
    localStorage.setItem('token', 'tok123');
    localStorage.setItem('user', JSON.stringify({ businessName: 'Vikas Milk Dairy', role: 'admin' }));
    localStorage.setItem('loginTime', String(Date.now() - 1000)); // 1s ago, well within window
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Vikas Milk Dairy'));
    expect(api.defaults.headers.common['Authorization']).toBe('Bearer tok123');
  });

  it('clears storage and leaves user null when the stored session is already past SESSION_MS', async () => {
    localStorage.setItem('token', 'tok123');
    localStorage.setItem('user', JSON.stringify({ businessName: 'Vikas Milk Dairy' }));
    localStorage.setItem('loginTime', String(Date.now() - (SESSION_MS + 1000))); // expired
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('AuthContext — login', () => {
  it('on success, stores the session and sets the Authorization header', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { accessToken: 'newtok', businessName: 'Vikas Milk Dairy', role: 'admin' } },
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    fireEvent.click(screen.getByText('do-login'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Vikas Milk Dairy'));

    expect(localStorage.getItem('token')).toBe('newtok');
    expect(JSON.parse(localStorage.getItem('user'))).toMatchObject({ businessName: 'Vikas Milk Dairy', role: 'admin' });
    expect(api.defaults.headers.common['Authorization']).toBe('Bearer newtok');
  });

  it('on failure, returns the server error message and does not set a user', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Invalid username or password' } } });
    let result;
    function LoginProbe() {
      const { login } = useAuth();
      return <button onClick={async () => { result = await login('bob', 'wrong'); }}>try-login</button>;
    }
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    fireEvent.click(screen.getByText('try-login'));

    await waitFor(() => expect(result).toEqual({ success: false, message: 'Invalid username or password' }));
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('AuthContext — logout', () => {
  it('calls the logout endpoint, clears storage, and clears the user', async () => {
    localStorage.setItem('token', 'tok123');
    localStorage.setItem('user', JSON.stringify({ businessName: 'Vikas Milk Dairy' }));
    localStorage.setItem('loginTime', String(Date.now()));
    vi.mocked(api.post).mockResolvedValue({});
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Vikas Milk Dairy'));

    fireEvent.click(screen.getByText('do-logout'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('still clears the session locally even if the logout request fails', async () => {
    localStorage.setItem('token', 'tok123');
    localStorage.setItem('user', JSON.stringify({ businessName: 'Vikas Milk Dairy' }));
    localStorage.setItem('loginTime', String(Date.now()));
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Vikas Milk Dairy'));

    fireEvent.click(screen.getByText('do-logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
  });
});

describe('AuthContext — proactive session-expiry timer', () => {
  it('auto-logs-out and redirects once SESSION_MS elapses after login', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { accessToken: 'newtok', businessName: 'Vikas Milk Dairy', role: 'admin' } },
    });
    renderProvider();
    await act(async () => { await Promise.resolve(); });

    await act(async () => { fireEvent.click(screen.getByText('do-login')); await Promise.resolve(); });
    expect(screen.getByTestId('user')).toHaveTextContent('Vikas Milk Dairy');

    vi.mocked(api.post).mockResolvedValue({}); // the auto-logout's own /auth/logout call
    await act(async () => {
      vi.advanceTimersByTime(SESSION_MS + 1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(expireSessionAndRedirect).toHaveBeenCalledWith('Your session expired after 2 hours. Please log in again.');
  });

  it('does not schedule a timer for an already-expired restored session', async () => {
    vi.useFakeTimers();
    localStorage.setItem('token', 'tok123');
    localStorage.setItem('user', JSON.stringify({ businessName: 'Vikas Milk Dairy' }));
    localStorage.setItem('loginTime', String(Date.now() - (SESSION_MS + 1000)));
    renderProvider();
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    vi.advanceTimersByTime(SESSION_MS * 2);
    expect(expireSessionAndRedirect).not.toHaveBeenCalled();
  });
});
