import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';

/**
 * Declarative parallel GET (Promise.all) with loading/error/refetch and
 * automatic error notification — the useApiResource sibling for pages that
 * need 2+ endpoints in lockstep: one loading flag, one error, one moment
 * ("everything just arrived") to derive further state from together,
 * rather than each endpoint updating independently.
 *
 * Replaces the copy-pasted `setLoading(true); Promise.all([...]).then(...)
 * .catch(...).finally(...)` block that appeared across the app's
 * multi-endpoint pages (stock receipt, dispatch, payments, stock balance).
 *
 * @param {(string|null)[]|null} urls   Endpoints, in order. Null/empty array disables the
 *   fetch entirely. An individual null entry is skipped (resolves to null in `data`)
 *   rather than making a request — useful for an endpoint gated on other state.
 * @param {object}   [opts]
 * @param {boolean}  [opts.enabled=true]        Skip the fetch entirely when false.
 * @param {*}        [opts.initialData]         Value for `data` before the first load.
 * @param {boolean}  [opts.notifyOnError=true]  Toast on failure.
 * @param {(payloads:any[])=>any} [opts.select] Runs once per successful fetch, given the
 *   unwrapped `{ success, data }` payloads in the same order as `urls` (an entry is
 *   `null` for a skipped url). Return value becomes `data`. Because this fires inside
 *   the fetch's async continuation — not synchronously in a render-triggered effect —
 *   it's the right place to derive/reset additional state (e.g. collapsing expanded
 *   rows on new data), matching useApiResource's `select` precedent.
 *
 * A monotonic request-id guards against a slow, now-stale response landing
 * after a newer one and overwriting fresher data — e.g. the urls change again
 * (a date picker) before the first Promise.all lands. Only the response set
 * matching the *latest* refetch() call is ever applied.
 *
 * @returns {{ data, loading, error, refetch, setData }}
 */
export function useApiResources(urls, opts = {}) {
  const { enabled = true, initialData = null, notifyOnError = true, select } = opts;
  const { notify } = useNotification();
  const hasUrls = Array.isArray(urls) && urls.length > 0;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(enabled && hasUrls));
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  // Stable dependency for the urls array.
  const urlsKey = hasUrls ? urls.join('|') : '';

  const refetch = useCallback(async () => {
    if (!hasUrls) return undefined;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const responses = await Promise.all(urls.map(u => (u ? api.get(u) : Promise.resolve(null))));
      if (requestIdRef.current !== requestId) return undefined; // superseded by a newer refetch — drop this stale response
      const payloads = responses.map(res => (res ? (res.data?.data ?? res.data) : null));
      const value = select ? select(payloads) : payloads;
      setData(value);
      return value;
    } catch (e) {
      if (requestIdRef.current !== requestId) return undefined;
      const msg = e.response?.data?.error ?? 'Failed to load data';
      setError(msg);
      if (notifyOnError) notify(msg, 'error');
      return undefined;
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
    // select/notify/urls are stable enough for this hook's purpose; urlsKey drives refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey]);

  useEffect(() => {
    if (enabled && hasUrls) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetch]);

  return { data, loading, error, refetch, setData };
}
