import { useState, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';

/**
 * Wraps a write operation with loading state, error toast, optional success
 * toast, and an onSuccess callback (typically a refetch). Never throws — it
 * resolves to `{ ok, result }` or `{ ok:false, error }` so callers branch
 * without try/catch. Collapses the repeated save/delete boilerplate across pages.
 *
 * @param {(...args:any[])=>Promise<any>} mutationFn  The async write (e.g. () => api.post(...)).
 * @param {object} [opts]
 * @param {(result:any, ...args:any[])=>void|Promise<void>} [opts.onSuccess]
 * @param {string}  [opts.successMessage]  Toast shown on success.
 * @param {boolean} [opts.notifyOnError=true]
 * @returns {{ mutate, loading, error }}
 */
export function useMutation(mutationFn, opts = {}) {
  const { onSuccess, successMessage, notifyOnError = true } = opts;
  const { notify } = useNotification();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn(...args);
        if (successMessage) notify(successMessage, 'success');
        if (onSuccess) await onSuccess(result, ...args);
        return { ok: true, result };
      } catch (e) {
        const msg = e.response?.data?.error ?? 'Something went wrong';
        setError(msg);
        if (notifyOnError) notify(msg, 'error');
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [mutationFn, onSuccess, successMessage, notifyOnError, notify]
  );

  return { mutate, loading, error };
}
