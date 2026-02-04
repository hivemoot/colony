import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActivityData } from './useActivityData';
import type { ActivityData } from '../types/activity';

const mockData: ActivityData = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
  },
  agents: [],
  commits: [],
  issues: [],
  pullRequests: [],
};

function mockFetchSuccess(data: ActivityData): Response {
  return { ok: true, json: () => Promise.resolve(data) } as Response;
}

describe('useActivityData', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches data on mount', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchSuccess(mockData));

    const { result } = renderHook(() =>
      useActivityData({ pollInterval: 0 }),
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('handles 404 gracefully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() =>
      useActivityData({ pollInterval: 0 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('handles fetch errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() =>
      useActivityData({ pollInterval: 0 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network failure');
  });

  it('polls for updates at the configured interval', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchSuccess(mockData));

    renderHook(() => useActivityData({ pollInterval: 5000 }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('does not poll when pollInterval is 0', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchSuccess(mockData));

    renderHook(() => useActivityData({ pollInterval: 0 }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('provides lastFetchedAt timestamp', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchSuccess(mockData));

    const { result } = renderHook(() =>
      useActivityData({ pollInterval: 0 }),
    );

    expect(result.current.lastFetchedAt).toBeNull();

    await waitFor(() => {
      expect(result.current.lastFetchedAt).toBeInstanceOf(Date);
    });
  });

  it('keeps previous data during poll refresh errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchSuccess(mockData))
      .mockRejectedValueOnce(new Error('Temporary failure'));

    const { result } = renderHook(() =>
      useActivityData({ pollInterval: 5000 }),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Data should still be present after poll failure
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('cleans up interval on unmount', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchSuccess(mockData));
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() =>
      useActivityData({ pollInterval: 5000 }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
