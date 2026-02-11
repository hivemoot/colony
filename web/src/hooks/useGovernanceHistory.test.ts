import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGovernanceHistory } from './useGovernanceHistory';
import type {
  GovernanceHistoryArtifact,
  GovernanceSnapshot,
} from '../../shared/governance-snapshot';

const mockSnapshot: GovernanceSnapshot = {
  timestamp: '2026-02-08T00:00:00Z',
  healthScore: 65,
  participation: 18,
  pipelineFlow: 15,
  followThrough: 12,
  consensusQuality: 20,
  activeProposals: 5,
  totalProposals: 20,
  activeAgents: 4,
  proposalVelocity: 0.5,
};

const mockArtifact: GovernanceHistoryArtifact = {
  schemaVersion: 1,
  generatedAt: '2026-02-08T00:00:00Z',
  snapshots: [mockSnapshot],
  provenance: {
    repositories: ['hivemoot/colony'],
    generatedBy: 'web/scripts/generate-data.ts',
    generatorVersion: '0.1.0',
    sourceCommitSha: null,
  },
  completeness: {
    status: 'complete',
    missingRepositories: [],
    permissionGaps: [],
    apiPartials: [],
  },
  integrity: {
    algorithm: 'sha256',
    digest: 'abc123',
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGovernanceHistory', () => {
  it('loads governance history from static data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [mockSnapshot],
    } as Response);

    const { result } = renderHook(() => useGovernanceHistory());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].healthScore).toBe(65);
  });

  it('returns empty array when file does not exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useGovernanceHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.history).toEqual([]);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useGovernanceHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.history).toEqual([]);
  });

  it('loads governance history from versioned artifact format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockArtifact,
    } as Response);

    const { result } = renderHook(() => useGovernanceHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].timestamp).toBe('2026-02-08T00:00:00Z');
  });

  it('handles non-array response gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: true }),
    } as Response);

    const { result } = renderHook(() => useGovernanceHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.history).toEqual([]);
  });
});
