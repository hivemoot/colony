import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActivityData } from './useActivityData';
import type { ActivityData } from '../types/activity';

const mockStaticData: ActivityData = {
  generatedAt: '2026-02-05T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [],
  agentStats: [],
  commits: [
    {
      sha: 'abc1234',
      message: 'feat: add tests',
      author: 'worker',
      date: '2026-02-05T10:00:00Z',
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Bug report',
      state: 'open',
      labels: [],
      author: 'scout',
      createdAt: '2026-02-05T09:00:00Z',
    },
  ],
  pullRequests: [],
  comments: [],
  proposals: [],
};

const mockLiveEvents = [
  {
    id: 'live-1',
    type: 'PushEvent',
    actor: { login: 'worker' },
    created_at: '2026-02-05T13:00:00Z',
    payload: {
      commits: [{ sha: 'def56789abcdef0', message: 'Live commit' }],
    },
  },
];

describe('useActivityData', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Static mode', () => {
    it('fetches /data/activity.json on mount and sets data', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(mockStaticData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { result } = renderHook(() => useActivityData());

      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toMatchObject(mockStaticData);
      expect(result.current.data?.governanceOps).toBeDefined();
      expect(result.current.mode).toBe('static');
      expect(result.current.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/data/activity.json')
      );
    });

    it('recomputes dashboard freshness against wall-clock time at read time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-11T12:00:00Z'));

      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ...mockStaticData,
            generatedAt: '2026-02-09T12:00:00Z',
          })
        )
      );

      const { result } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const freshness = result.current.data?.governanceOps?.slos.find(
        (slo) => slo.id === 'dashboard-freshness'
      );
      expect(freshness?.current).toBe('48h old');
      expect(freshness?.status).toBe('at-risk');
    });

    it('returns events built from static data', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockStaticData)));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.events.length).toBeGreaterThan(0);
      const commitEvent = result.current.events.find(
        (e) => e.type === 'commit'
      );
      expect(commitEvent).toMatchObject({
        id: 'commit-abc1234',
        actor: 'worker',
      });
    });

    it('handles 404 gracefully (no error, null data)', async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 404 }));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('handles fetch failure with error state', async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 500 }));

      const { result } = renderHook(() => useActivityData());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toContain('500');
    });

    it('preserves stale data when refetch fails', async () => {
      vi.useFakeTimers();

      // First fetch succeeds
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const firstData = result.current.data;
      expect(firstData).toMatchObject(mockStaticData);
      expect(result.current.error).toBeNull();

      // Second fetch fails — data should be preserved
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      // Stale data preserved, no error shown
      expect(result.current.data).toEqual(firstData);
      expect(result.current.error).toBeNull();
    });

    it('preserves stale data when refetch returns 404', async () => {
      vi.useFakeTimers();

      // First fetch succeeds
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const firstData = result.current.data;
      expect(firstData).toMatchObject(mockStaticData);

      // Refetch returns 404 — stale data preserved
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(result.current.data).toEqual(firstData);
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    it('polls every 60 seconds', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockStaticData)));

      renderHook(() => useActivityData());

      // Initial fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const callsAfterMount = mockFetch.mock.calls.length;

      // Advance 60s — should trigger one poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockFetch.mock.calls.length).toBe(callsAfterMount + 1);

      // Advance another 60s — should trigger another poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockFetch.mock.calls.length).toBe(callsAfterMount + 2);
    });
  });

  describe('Live mode', () => {
    it('transitions to connecting then live on success', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Set up live response before enabling
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents), {
          headers: { etag: 'etag-1' },
        })
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => expect(result.current.mode).toBe('live'));
      expect(result.current.events[0].title).toContain('Live commit');
    });

    it('uses ETag for conditional requests', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // First live fetch returns with etag
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents), {
          headers: { etag: 'etag-abc' },
        })
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      // Flush microtask queue — the live fetch chain uses async/await
      // internally, so multiple zero-time advances drain queued promises
      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.mode).toBe('live');

      // Second live fetch should use If-None-Match with the etag
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('events'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'If-None-Match': 'etag-abc',
          }),
        })
      );
    });

    it('handles 304 Not Modified without changing data', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents), {
          headers: { etag: 'etag-1' },
        })
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      const eventsBeforeNotModified = result.current.events;

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      // Events should remain unchanged
      expect(result.current.events).toEqual(eventsBeforeNotModified);
      expect(result.current.mode).toBe('live');
    });

    it('handles rate limit 403 with fallback mode', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.mode).toBe('fallback');
      expect(result.current.liveMessage).toContain('rate limited');
    });

    it('handles rate limit 429 with fallback mode', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.mode).toBe('fallback');
      expect(result.current.liveMessage).toContain('rate limited');
    });

    it('falls back to static events on live fetch error', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const staticEventsCount = result.current.events.length;

      // Non-rate-limit error
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 502 }));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => expect(result.current.mode).toBe('fallback'));

      // Should show static events as fallback
      expect(result.current.events.length).toBe(staticEventsCount);
      expect(result.current.liveMessage).toContain('unavailable');
    });

    it('resets to static mode when live is disabled', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents))
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await waitFor(() => expect(result.current.mode).toBe('live'));

      await act(async () => {
        result.current.setLiveEnabled(false);
      });

      expect(result.current.mode).toBe('static');
      // Should show static events again
      const commitEvent = result.current.events.find(
        (e) => e.type === 'commit'
      );
      expect(commitEvent).toBeDefined();
      expect(commitEvent?.id).toContain('abc1234');
    });

    it('shows connecting message during transition', async () => {
      // Use a never-resolving promise to hold the hook in connecting state
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Make live fetch hang
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      expect(result.current.mode).toBe('connecting');
      expect(result.current.liveMessage).toContain('Connecting');
    });
  });

  describe('Exponential backoff', () => {
    it('doubles delay on rate limit, caps at 5 minutes', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Track setTimeout calls to verify backoff progression
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      // Each live fetch returns 403 to trigger backoff
      for (let i = 0; i < 6; i++) {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
      }

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      // Collect the polling delays from setTimeout calls
      const pollingDelays: number[] = [];
      for (const call of setTimeoutSpy.mock.calls) {
        const delay = call[1] as number;
        // Filter to only live polling delays (>= 20000ms base)
        if (delay >= 20_000) {
          pollingDelays.push(delay);
        }
      }

      // First call triggers initial fetch, which fails → schedules next
      // Backoff starts at 40s (20s * 2 after first failure)
      expect(pollingDelays[0]).toBe(40_000);

      // Advance through backoff cycles, asserting each delay explicitly
      const advanceAndExpect = async (
        advanceBy: number,
        expectedDelay: number
      ): Promise<void> => {
        setTimeoutSpy.mockClear();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(advanceBy);
        });
        const delays = setTimeoutSpy.mock.calls
          .map((c) => c[1] as number)
          .filter((d) => d >= 20_000);
        expect(delays).toHaveLength(1);
        expect(delays[0]).toBe(expectedDelay);
      };

      await advanceAndExpect(40_000, 80_000);
      await advanceAndExpect(80_000, 160_000);
      // 320_000 would exceed cap, so it should be capped at 300_000
      await advanceAndExpect(160_000, 300_000);

      setTimeoutSpy.mockRestore();
    });

    it('resets backoff on success after rate limit', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // First live fetch: rate limited
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.mode).toBe('fallback');

      // Second live fetch: success — should reset backoff to 20s
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents), {
          headers: { etag: 'etag-new' },
        })
      );

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      // Advance past the 40s backoff delay to trigger the next fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });

      // Flush microtasks so the successful fetch resolves
      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.mode).toBe('live');

      // After success, next poll should use base delay (20s)
      const baseDelays = setTimeoutSpy.mock.calls
        .map((c) => c[1] as number)
        .filter((d) => d >= 20_000);
      expect(baseDelays.length).toBeGreaterThanOrEqual(1);
      expect(baseDelays[baseDelays.length - 1]).toBe(20_000);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('stops static polling on unmount', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockStaticData)));

      const { unmount } = renderHook(() => useActivityData());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const callsAtUnmount = mockFetch.mock.calls.length;
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      // No additional fetches after unmount
      expect(mockFetch.mock.calls.length).toBe(callsAtUnmount);
    });

    it('stops live polling on unmount', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result, unmount } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockLiveEvents))
      );

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      const callsBeforeUnmount = mockFetch.mock.calls.length;
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      // No additional live fetches after unmount
      expect(mockFetch.mock.calls.length).toBe(callsBeforeUnmount);
    });
  });

  describe('liveMessage', () => {
    it('returns null when live mode is disabled', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockStaticData)));

      const { result } = renderHook(() => useActivityData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.liveMessage).toBeNull();
    });

    it('returns unavailable message for non-rate-limit errors', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStaticData))
      );

      const { result } = renderHook(() => useActivityData());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Simulate a network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        result.current.setLiveEnabled(true);
      });

      await act(async () => {
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.mode).toBe('fallback');
      expect(result.current.liveMessage).toBe(
        'Live feed unavailable. Showing static data.'
      );
    });
  });
});
