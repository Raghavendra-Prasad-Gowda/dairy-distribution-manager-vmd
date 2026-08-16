import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';

/**
 * Declarative GET with loading/error/refetch and automatic error notification.
 *
 * Replaces the copy-pasted `setLoading(true) … try api.get … catch notify …
 * finally setLoading(false)` block that appeared in ~27 pages. Unwraps the
 * standard `{ success, data }` envelope so callers get `data` directly.
 *
 * @param {string|null} url            Endpoint (relative to the axios baseURL). Null disables the fetch.
 * @param {object}   [opts]
 * @param {object}   [opts.params]       Query params (re-fetches when they change).
 * @param {boolean}  [opts.enabled=true] Skip the fetch entirely when false.
 * @param {*}        [opts.initialData]  Value for `data` before the first load.
 * @param {boolean}  [opts.notifyOnError=true] Toast on failure.
 * @param {(payload:any)=>any} [opts.select] Transform the payload before storing.
 * @returns {{ data, loading, error, refetch, setData }}
 */
export function useApiResource(url, opts = {}) {
  const { params, enabled = true, initialData = null, notifyOnError = true, select } = opts;
  const { notify } = useNotification();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(enabled && url));
  const [error, setError] = useState(null);

  // Stable dependency for the params object.
  const paramsKey = params ? JSON.stringify(params) : '';

  const refetch = useCallback(async () => {
    if (!url) return undefined;
    setLoading(true);
    setError(null);
    try {
      const res = params ? await api.get(url, { params }) : await api.get(url);
      const payload = res.data?.data ?? res.data;
      const value = select ? select(payload) : payload;
      setData(value);
      return value;
    } catch (e) {
      const msg = e.response?.data?.error ?? 'Failed to load data';
      setError(msg);
      if (notifyOnError) notify(msg, 'error');
      return undefined;
    } finally {
      setLoading(false);
    }
    // select/notify are stable enough for this hook's purpose; url + params drive refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey]);

  useEffect(() => {
    if (enabled && url) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetch]);

  return { data, loading, error, refetch, setData };
}
