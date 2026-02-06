import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActivityData } from './useActivityData';

// Mock data
const mockActivityData = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 10,
    forks: 5,
    openIssues: 2,
  },
  agents: [],
  agentStats: [],
  commits: [],
  issues: [],
  pullRequests: [],
  comments: [],
  proposals: [],
};

const mockEvent = {
  id: '1',
  type: 'PushEvent',
  actor: { login: 'scout' },
  created_at: new Date().toISOString(),
  payload: { commits: [{ sha: '123', message: 'Live commit' }] },
};

describe('useActivityData', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should fetch static data on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });

    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockActivityData);
  });

  it('should handle 404 gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(null);
  });

  it('should transition to live mode and back', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => mockActivityData });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['etag', 'v1']]),
      json: async () => [mockEvent],
    });

    await act(async () => {
      result.current.setLiveEnabled(true);
    });

    await waitFor(() => expect(result.current.mode).toBe('live'));
    expect(result.current.liveEnabled).toBe(true);

    await act(async () => {
      result.current.setLiveEnabled(false);
    });

    expect(result.current.mode).toBe('static');
  });

  it('should handle live feed errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => mockActivityData });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await act(async () => {
      result.current.setLiveEnabled(true);
    });

    await waitFor(() => expect(result.current.mode).toBe('fallback'));
  });

  it('should use ETag for live polling', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First live fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['etag', 'v123']]),
      json: async () => [mockEvent],
    });

    await act(async () => {
      result.current.setLiveEnabled(true);
    });

    await waitFor(() => expect(result.current.mode).toBe('live'));

    // Verify GitHub API was called with correct headers
    const liveCall = mockFetch.mock.calls.find((call) =>
      (call[0] as string).includes('api.github.com')
    );
    expect(liveCall).toBeDefined();
    expect(liveCall![1].headers.Accept).toBe('application/vnd.github.v3+json');
  });

  it('should handle rate limit (403) with appropriate message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rate limited response
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await act(async () => {
      result.current.setLiveEnabled(true);
    });

    await waitFor(() => expect(result.current.mode).toBe('fallback'));
    expect(result.current.liveMessage).toContain('rate limited');
  });

  it('should handle rate limit (429) with appropriate message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rate limited response (429)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    await act(async () => {
      result.current.setLiveEnabled(true);
    });

    await waitFor(() => expect(result.current.mode).toBe('fallback'));
    expect(result.current.liveMessage).toContain('rate limited');
  });

  it('should show connecting message during live transition', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Don't resolve live fetch immediately
    let resolveLiveFetch!: (value: unknown) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLiveFetch = resolve;
        })
    );

    act(() => {
      result.current.setLiveEnabled(true);
    });

    // Should be in connecting state before live fetch resolves
    expect(result.current.mode).toBe('connecting');
    expect(result.current.liveMessage).toContain('Connecting');

    // Resolve the fetch
    await act(async () => {
      resolveLiveFetch({
        ok: true,
        status: 200,
        headers: new Map([['etag', 'v1']]),
        json: async () => [mockEvent],
      });
    });

    await waitFor(() => expect(result.current.mode).toBe('live'));
    expect(result.current.liveMessage).toBe(null);
  });

  it('should handle fetch failure on initial load', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
  });

  it('should build events from static data', async () => {
    const dataWithCommits = {
      ...mockActivityData,
      commits: [
        {
          sha: 'abc1234',
          message: 'Test commit',
          author: 'scout',
          date: new Date().toISOString(),
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => dataWithCommits,
    });

    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events.length).toBeGreaterThan(0);
    expect(result.current.events[0].type).toBe('commit');
  });

  it('should reset live state when disabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivityData,
    });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Enable live
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['etag', 'v1']]),
      json: async () => [mockEvent],
    });

    await act(async () => {
      result.current.setLiveEnabled(true);
    });
    await waitFor(() => expect(result.current.mode).toBe('live'));

    // Disable live
    await act(async () => {
      result.current.setLiveEnabled(false);
    });

    expect(result.current.mode).toBe('static');
    expect(result.current.liveEnabled).toBe(false);
    expect(result.current.liveMessage).toBe(null);
  });

  it('should handle non-200 static fetch error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(() => useActivityData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('500');
  });
});