import axios from 'axios';
import { markRequestStart, markRequestEnd, nextRequestId } from './coldStart';

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
api.interceptors.response.use(
  (response) => {
    if (response.config?.__reqId != null) markRequestEnd(response.config.__reqId);
    return response;
  },
  (error) => {
    if (error.config?.__reqId != null) markRequestEnd(error.config.__reqId);
    const url = error.config?.url ?? '';
    const isPinEndpoint = url.includes('/pin/');
    if (error.response?.status === 401 && !isPinEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
