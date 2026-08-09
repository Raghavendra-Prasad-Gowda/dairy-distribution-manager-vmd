import axios from 'axios';
import { markRequestStart, markRequestEnd, nextRequestId } from './coldStart';
import { isLocalSessionExpired, expireSessionAndRedirect } from '../utils/session';

if (!import.meta.env.VITE_API_BASE_URL && !import.meta.env.DEV) {
  console.error('[API] VITE_API_BASE_URL is not set. API calls will fail in production.');
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // 60s — Render cold start can take 30-50s
  withCredentials: true,
});

// Attach JWT + cold-start tracking on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    // Tag each request with an id so the response side can clear the slow-timer
    config.__reqId = nextRequestId();
    markRequestStart(config.__reqId);
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 — token expired → redirect to login
//
// Exceptions: not every 401 means "your session died". The server also returns
// 401 for "what you just typed is wrong" — a wrong PIN, wrong login
// credentials, or a wrong current password on the change-password screen.
// Redirecting on those is actively harmful: the hard navigation in
// expireSessionAndRedirect() wipes the very error message the user needs to
// read, and on change-password it logs someone out over a typo. Those cases
// are left to reject normally so the calling page can show its own message.
//
// A second case is also handled here: a request that times out or fails
// with no HTTP response at all (e.g. a Render cold start that ate the
// whole 60s timeout budget) never gets a 401 to key off of. When that
// happens and the locally-recorded session is already past its 2h window,
// treat it the same as an expired session — otherwise the user is left
// stuck with a dead token and no way to know why nothing works.
api.interceptors.response.use(
  (response) => {
    if (response.config?.__reqId != null) markRequestEnd(response.config.__reqId);
    return response;
  },
  (error) => {
    if (error.config?.__reqId != null) markRequestEnd(error.config.__reqId);
    const url = error.config?.url ?? '';
    const isPinEndpoint = url.includes('/pin/');
    // The user either has no session yet (login) or is re-entering their own
    // current password — in both cases a 401 is a validation result, not an
    // expiry, so it must never bounce them to the login screen.
    const isCredentialCheck =
      url.includes('/auth/login') || url.includes('/auth/change-password');

    if (!isPinEndpoint && !isCredentialCheck) {
      if (error.response?.status === 401) {
        expireSessionAndRedirect('Your session expired. Please log in again.');
      } else if (!error.response && isLocalSessionExpired()) {
        // No HTTP response (timeout/network error) and the local session
        // clock is already past its 2h window — almost certainly an
        // expired token that never made it back as a clean 401.
        expireSessionAndRedirect('Your session expired. Please log in again.');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
