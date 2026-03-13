import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGovernanceHealthHistory } from './useGovernanceHealthHistory';
import type {
  GovernanceHealthHistory,
  GovernanceHealthEntry,
} from '../../shared/governance-health-history';

function makeEntry(timestamp: string): GovernanceHealthEntry {
  return {
    timestamp,
    prCycleTime: { p50: 1440, p95: 10080, sampleSize: 10 },
    roleDiversity: {
      uniqueRoles: 5,
      giniIndex: 0.3,
      topRole: 'builder',
      topRoleShare: 0.4,
    },
    contestedDecisionRate: { contestedCount: 2, totalVoted: 10, rate: 0.2 },
    crossRoleReviewRate: { crossRoleCount: 8, totalReviews: 10, rate: 0.8 },
    warningCount: 0,
  };
}

const mockHistory: GovernanceHealthHistory = {
  schemaVersion: 1,
  generatedAt: '2026-03-08T00:00:00Z',
  snapshots: [
    makeEntry('2026-03-07T00:00:00Z'),
    makeEntry('2026-03-08T00:00:00Z'),
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGovernanceHealthHistory', () => {
  it('loads snapshots from governance-health-history.json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHistory,
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthHistory());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snapshots).toHaveLength(2);
    expect(result.current.snapshots[0].timestamp).toBe('2026-03-07T00:00:00Z');
    expect(result.current.snapshots[0].prCycleTime.p95).toBe(10080);
    expect(result.current.snapshots[0].roleDiversity.giniIndex).toBe(0.3);
  });

  it('returns empty array when file does not exist (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snapshots).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useGovernanceHealthHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snapshots).toEqual([]);
  });

  it('returns empty array when response has no snapshots field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, generatedAt: '...' }),
    } as Response);

    const { result } = renderHook(() => useGovernanceHealthHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snapshots).toEqual([]);
  });
});
