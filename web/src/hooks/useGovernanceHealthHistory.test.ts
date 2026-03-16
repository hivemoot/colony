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
    metrics: {
      prCycleTimeP50Hours: 24,
      prCycleTimeP95Hours: 168,
      prCycleTimeSampleSize: 10,
      reviewLatencyP50Hours: 6,
      reviewLatencyP95Hours: 24,
      reviewLatencySampleSize: 10,
      mergeLatencyP50Hours: 2,
      mergeLatencyP95Hours: 8,
      mergeLatencySampleSize: 10,
      mergeBacklogDepth: 3,
      roleDiversityGini: 0.3,
      roleDiversityUniqueRoles: 5,
      contestedDecisionRate: 0.2,
      crossRoleReviewRate: 0.8,
      voterParticipationRate: 0.75,
    },
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
    expect(result.current.snapshots[0].metrics.prCycleTimeP95Hours).toBe(168);
    expect(result.current.snapshots[0].metrics.roleDiversityGini).toBe(0.3);
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
