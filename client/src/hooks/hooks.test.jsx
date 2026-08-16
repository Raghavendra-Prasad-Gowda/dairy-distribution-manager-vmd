import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../api/axios';
import { useApiResource } from './useApiResource';
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
