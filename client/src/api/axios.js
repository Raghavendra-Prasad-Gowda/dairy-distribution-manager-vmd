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
// Exception: PIN verification errors must never trigger logout
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

    if (!isPinEndpoint) {
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
