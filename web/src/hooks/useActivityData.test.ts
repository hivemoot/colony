import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActivityData } from './useActivityData';
import type { ActivityData } from '../types/activity';

const mockActivityData: ActivityData = {
  generatedAt: '2026-02-05T10:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 10,
    forks: 2,
    openIssues: 3,
  },
  agents: [{ login: 'builder' }],
  agentStats: [
    {
      login: 'builder',
      commits: 5,
      pullRequestsMerged: 2,
      issuesOpened: 1,
      reviews: 0,
      comments: 0,
      lastActiveAt: '2026-02-05T10:00:00Z',
    },
  ],
  commits: [
    {
      sha: 'abc1234',
      message: 'feat: initial',
      author: 'builder',
      date: '2026-02-05T09:00:00Z',
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Bug report',
      state: 'open',
      labels: ['bug'],
      author: 'scout',
      createdAt: '2026-02-05T08:00:00Z',
    },
  ],
  pullRequests: [
    {
      number: 2,
      title: 'Fix bug',
      state: 'merged',
      author: 'builder',
      createdAt: '2026-02-05T07:00:00Z',
    },
  ],
  comments: [],
  proposals: [],
};

function mockResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  } as Response;
}

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

describe('useActivityData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('static mode', () => {
    it('fetches /data/activity.json on mount and sets data', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockActivityData);
      expect(result.current.events.length).toBeGreaterThan(0);
      expect(result.current.error).toBeNull();
      expect(result.current.mode).toBe('static');
      expect(result.current.lastUpdated).toBeInstanceOf(Date);
    });

    it('returns mode "static" with events built from data', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.mode).toBe('static');
      // Expect events from 1 commit + 1 issue + 1 PR
      expect(result.current.events).toHaveLength(3);
    });

    it('handles 404 gracefully (pre-build state)', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(404));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.events).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('handles fetch failure on initial load', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(500));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toContain('500');
    });

    it('handles network error on initial load', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network failure');
    });

    it('preserves stale data when refetch fails', async () => {
      vi.useFakeTimers();

      // First fetch succeeds
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.data).toEqual(mockActivityData);
      expect(result.current.error).toBeNull();

      // Subsequent fetch fails
      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      // Stale data preserved, no error shown
      expect(result.current.data).toEqual(mockActivityData);
      expect(result.current.events.length).toBeGreaterThan(0);
      expect(result.current.error).toBeNull();
    });

    it('polls every 60 seconds', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue(mockResponse(200, mockActivityData));

      renderHook(() => useActivityData());

      // Initial fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance 60s — second poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance another 60s — third poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('cleans up interval on unmount', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue(mockResponse(200, mockActivityData));

      const { unmount } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      unmount();

      // Advancing time after unmount should NOT trigger more fetches
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('live mode', () => {
    const livePayload = [
      {
        id: '1',
        type: 'PushEvent',
        actor: { login: 'builder' },
        repo: { name: 'hivemoot/colony' },
        created_at: '2026-02-05T12:00:00Z',
        payload: {
          commits: [{ sha: 'def5678', message: 'live commit' }],
        },
      },
    ];

    it('transitions to "connecting" when setLiveEnabled(true)', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Block the live fetch to observe connecting state
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      act(() => {
        result.current.setLiveEnabled(true);
      });

      expect(result.current.mode).toBe('connecting');
      expect(result.current.liveMessage).toBe(
        'Connecting to GitHub live feed…'
      );
    });

    it('transitions to "live" on successful fetch', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, livePayload, { etag: '"v1"' })
      );

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('live');
      });

      expect(result.current.events.length).toBeGreaterThan(0);
      expect(result.current.liveMessage).toBeNull();
    });

    it('uses ETag for conditional requests (304 keeps data)', async () => {
      vi.useFakeTimers();

      // Static fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      // Flush initial static fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // First live fetch returns ETag
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, livePayload, { etag: '"v1"' })
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      // Flush the live fetch triggered by setLiveEnabled
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.mode).toBe('live');

      // Second live fetch returns 304 — scheduled 20s after first
      mockFetch.mockResolvedValueOnce(mockResponse(304));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      // Verify If-None-Match header was sent on the 304 request
      const lastLiveCall =
        mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const headers = (lastLiveCall[1] as RequestInit)?.headers as Record<
        string,
        string
      >;
      expect(headers['If-None-Match']).toBe('"v1"');

      // Mode should still be live (data preserved from first fetch)
      expect(result.current.mode).toBe('live');
    });

    it('handles rate limit (403) with fallback mode and message', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce(mockResponse(403));

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('fallback');
      });

      expect(result.current.liveMessage).toBe(
        'Live feed paused (rate limited). Showing static data.'
      );
    });

    it('handles rate limit (429) with fallback mode and message', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce(mockResponse(429));

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('fallback');
      });

      expect(result.current.liveMessage).toBe(
        'Live feed paused (rate limited). Showing static data.'
      );
    });

    it('falls back to static data on live fetch error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('fallback');
      });

      expect(result.current.liveMessage).toBe(
        'Live feed unavailable. Showing static data.'
      );
      // Static events should still be available
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    it('resets to "static" when setLiveEnabled(false)', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, livePayload, { etag: '"v1"' })
      );

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.mode).toBe('live');
      });

      act(() => {
        result.current.setLiveEnabled(false);
      });

      expect(result.current.mode).toBe('static');
      expect(result.current.liveMessage).toBeNull();
      expect(result.current.liveEnabled).toBe(false);
    });

    it('caps exponential backoff at 5 minutes', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Each live fetch returns 429 to trigger backoff doubling
      // Expected delays: 20s -> 40s -> 80s -> 160s -> 300s (cap) -> 300s
      const expectedDelays = [
        20_000, 40_000, 80_000, 160_000, 300_000, 300_000,
      ];

      act(() => {
        result.current.setLiveEnabled(true);
      });

      for (const delay of expectedDelays) {
        mockFetch.mockResolvedValueOnce(mockResponse(429));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay);
        });
      }

      // After multiple rate limits, mode should be fallback
      expect(result.current.mode).toBe('fallback');
    });

    it('cleans up timeout on unmount during live mode', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result, unmount } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Start live mode with a pending fetch
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, livePayload, { etag: '"v1"' })
      );

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const callCountBeforeUnmount = mockFetch.mock.calls.length;

      unmount();

      // Advancing time after unmount should NOT trigger more live fetches
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(callCountBeforeUnmount);
    });
  });

  describe('edge cases', () => {
    it('sends request to correct GitHub Events API endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, []));

      act(() => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/hivemoot/colony/events?per_page=30',
          expect.objectContaining({
            headers: expect.objectContaining({
              Accept: 'application/vnd.github.v3+json',
            }),
          })
        );
      });
    });

    it('loading is true initially and false after first fetch', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('liveEnabled defaults to false', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useActivityData());

      expect(result.current.liveEnabled).toBe(false);
      expect(result.current.mode).toBe('static');
    });

    it('liveMessage is null when not in live mode', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, mockActivityData));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.liveMessage).toBeNull();
    });
  });
});
