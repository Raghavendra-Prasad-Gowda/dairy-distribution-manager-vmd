import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../api/axios';
import { useApiResource } from './useApiResource';
import { useApiResources } from './useApiResources';
import { useMutation } from './useMutation';
import { useDisclosure } from './useDisclosure';
import { useDebouncedValue } from './useDebouncedValue';

vi.mock('../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** A manually-resolvable promise, for controlling response ordering in staleness tests. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useApiResource', () => {
  it('loads and unwraps the {success,data} envelope', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: [{ id: 1 }] } });
    const { result } = renderHook(() => useApiResource('/things'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
  });

  it('sets error and notifies on failure', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'boom' } } });
    const { result } = renderHook(() => useApiResource('/things'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(notify).toHaveBeenCalledWith('boom', 'error');
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useApiResource('/things', { enabled: false }));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('drops a stale response that resolves after a newer refetch has already landed', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(api.get)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useApiResource('/things'));
    // A second refetch starts (e.g. url/params changed) before the first lands.
    let secondCall;
    await act(async () => { secondCall = result.current.refetch(); });

    // The newer request resolves first...
    second.resolve({ data: { success: true, data: 'fresh' } });
    await act(async () => { await secondCall; });
    expect(result.current.data).toBe('fresh');
    expect(result.current.loading).toBe(false);

    // ...then the older, now-stale request finally resolves too.
    await act(async () => {
      first.resolve({ data: { success: true, data: 'stale' } });
      await Promise.resolve();
    });
    expect(result.current.data).toBe('fresh'); // unchanged — stale response was dropped
    expect(result.current.loading).toBe(false); // stale response's finally didn't reopen loading
  });
});

describe('useApiResources', () => {
  it('fetches every url in parallel and unwraps each payload, in order', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/a') return Promise.resolve({ data: { success: true, data: { name: 'A' } } });
      if (url === '/b') return Promise.resolve({ data: { success: true, data: [1, 2] } });
      return Promise.reject(new Error('unexpected url'));
    });
    const { result } = renderHook(() => useApiResources(['/a', '/b']));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ name: 'A' }, [1, 2]]);
    expect(api.get).toHaveBeenCalledWith('/a');
    expect(api.get).toHaveBeenCalledWith('/b');
  });

  it('skips a null entry in the urls array without making a request, resolving it to null', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: { name: 'A' } } });
    const { result } = renderHook(() => useApiResources(['/a', null]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ name: 'A' }, null]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('runs select() on the combined payload array once per successful fetch', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/a') return Promise.resolve({ data: { success: true, data: { total: 3 } } });
      return Promise.resolve({ data: { success: true, data: [{ id: 1 }] } });
    });
    const select = vi.fn(([summary, rows]) => ({ total: summary.total, rowCount: rows.length }));
    const { result } = renderHook(() => useApiResources(['/a', '/b'], { select }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(select).toHaveBeenCalledWith([{ total: 3 }, [{ id: 1 }]]);
    expect(result.current.data).toEqual({ total: 3, rowCount: 1 });
  });

  it('sets one shared error and notifies once when any request fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/a') return Promise.resolve({ data: { success: true, data: {} } });
      return Promise.reject({ response: { data: { error: 'boom' } } });
    });
    const { result } = renderHook(() => useApiResources(['/a', '/b']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(notify).toHaveBeenCalledWith('boom', 'error');
  });

  it('does not fetch when the urls array is empty or null', async () => {
    const { result: r1 } = renderHook(() => useApiResources([]));
    const { result: r2 } = renderHook(() => useApiResources(null));
    expect(api.get).not.toHaveBeenCalled();
    expect(r1.current.loading).toBe(false);
    expect(r2.current.loading).toBe(false);
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useApiResources(['/a', '/b'], { enabled: false }));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('refetch() re-runs all requests on demand', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: 'x' } });
    const { result } = renderHook(() => useApiResources(['/a']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refetch(); });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('drops a stale response set that resolves after a newer refetch has already landed', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(api.get)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useApiResources(['/a']));
    let secondCall;
    await act(async () => { secondCall = result.current.refetch(); });

    second.resolve({ data: { success: true, data: 'fresh' } });
    await act(async () => { await secondCall; });
    expect(result.current.data).toEqual(['fresh']);

    await act(async () => {
      first.resolve({ data: { success: true, data: 'stale' } });
      await Promise.resolve();
    });
    expect(result.current.data).toEqual(['fresh']); // unchanged — stale response dropped
    expect(result.current.loading).toBe(false);
  });
});

describe('useMutation', () => {
  it('runs onSuccess and shows the success toast', async () => {
    const onSuccess = vi.fn();
    const fn = vi.fn().mockResolvedValue({ id: 9 });
    const { result } = renderHook(() =>
      useMutation(fn, { onSuccess, successMessage: 'Saved' })
    );
    let outcome;
    await act(async () => {
      outcome = await result.current.mutate('arg');
    });
    expect(fn).toHaveBeenCalledWith('arg');
    expect(outcome).toEqual({ ok: true, result: { id: 9 } });
    expect(onSuccess).toHaveBeenCalledWith({ id: 9 }, 'arg');
    expect(notify).toHaveBeenCalledWith('Saved', 'success');
  });

  it('returns ok:false and notifies on error (never throws)', async () => {
    const fn = vi.fn().mockRejectedValue({ response: { data: { error: 'nope' } } });
    const { result } = renderHook(() => useMutation(fn));
    let outcome;
    await act(async () => {
      outcome = await result.current.mutate();
    });
    expect(outcome).toEqual({ ok: false, error: 'nope' });
    expect(notify).toHaveBeenCalledWith('nope', 'error');
  });
});

describe('useDisclosure', () => {
  it('opens, closes and toggles', () => {
    const { result } = renderHook(() => useDisclosure());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });
});

describe('useDebouncedValue', () => {
  it('updates only after the delay', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), {
      initialProps: { v: 'a' },
    });
    expect(result.current).toBe('a');
    rerender({ v: 'b' });
    expect(result.current).toBe('a'); // not yet
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });
});
