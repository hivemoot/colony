import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGovernanceHealthMetrics } from './useGovernanceHealthMetrics';
import type { GovernanceHealthMetrics } from '../../shared/governance-health-metrics';

const mockMetrics: GovernanceHealthMetrics = {
  computedAt: '2026-03-05T00:00:00Z',
  dataWindowDays: 30,
  mergedPrsSampled: 10,
  metrics: {
    prCycleTime: { p50Days: 0.8, p95Days: 2.5, sampleSize: 10 },
    roleDiversity: { gini: 0.32, sampleSize: 6 },
    contestedDecisionRate: { rate: 0.1, contestedCount: 1, totalVoted: 10 },
    crossAgentReviewRate: {
      rate: 0.85,
      crossAgentCount: 17,
      totalReviews: 20,
    },
  },
  warnings: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGovernanceHealthMetrics', () => {
  it('loads metrics from a valid artifact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetrics,
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).not.toBeNull();
    expect(result.current.metrics?.mergedPrsSampled).toBe(10);
  });

  it('returns null when artifact does not exist (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).toBeNull();
  });

  it('returns null on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).toBeNull();
  });

  it('returns null when artifact is malformed (missing metrics key)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ computedAt: '2026-03-05T00:00:00Z' }),
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Malformed artifact must not crash — it should fall back to null
    expect(result.current.metrics).toBeNull();
  });

  it('returns null when artifact is an empty object {}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).toBeNull();
  });

  it('returns null when artifact metrics sub-object is missing a metric', async () => {
    const malformed = {
      ...mockMetrics,
      metrics: {
        prCycleTime: mockMetrics.metrics.prCycleTime,
        // missing roleDiversity, contestedDecisionRate, crossAgentReviewRate
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => malformed,
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).toBeNull();
  });
});
