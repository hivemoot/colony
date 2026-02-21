import { describe, it, expect } from 'vitest';
import { computeBenchmarkMetrics } from './benchmark';
import type { ActivityData } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-20T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 2,
      forks: 0,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    proposals: [],
    comments: [],
    ...overrides,
  };
}

describe('computeBenchmarkMetrics', () => {
  it('always returns three comparisons', () => {
    const result = computeBenchmarkMetrics(makeData());
    expect(result.comparisons).toHaveLength(3);
  });

  it('returns unknown verdict when no merged PRs exist', () => {
    const result = computeBenchmarkMetrics(makeData());
    const prCycle = result.comparisons.find((c) => c.id === 'pr-cycle-time');
    expect(prCycle).toBeDefined();
    expect(prCycle?.verdict).toBe('unknown');
    expect(prCycle?.colonyValue).toBeNull();
    expect(prCycle?.ratio).toBeNull();
  });

  it('reports much-faster when PR cycle time is well below baseline', () => {
    // Baseline is 48h; a 4h median = ratio 0.083 → much-faster
    const now = new Date('2026-02-20T12:00:00Z').getTime();
    const prs = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'merged' as const,
      author: 'agent-x',
      createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      mergedAt: new Date(now - i * 60 * 1000).toISOString(),
      closedAt: new Date(now - i * 60 * 1000).toISOString(),
    }));
    const result = computeBenchmarkMetrics(makeData({ pullRequests: prs }));
    const prCycle = result.comparisons.find((c) => c.id === 'pr-cycle-time');
    expect(prCycle?.verdict).toBe('much-faster');
    expect(prCycle?.ratio).not.toBeNull();
    expect(prCycle?.ratio ?? Infinity).toBeLessThan(0.25);
  });

  it('reports comparable when PR cycle time is near the baseline', () => {
    // Baseline is 48h; use exactly 48h cycle time → ratio ≈ 1.0
    const now = new Date('2026-02-20T12:00:00Z').getTime();
    const prs = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'merged' as const,
      author: 'agent-y',
      createdAt: new Date(
        now - 48 * 60 * 60 * 1000 - i * 60 * 1000
      ).toISOString(),
      mergedAt: new Date(now - i * 60 * 1000).toISOString(),
      closedAt: new Date(now - i * 60 * 1000).toISOString(),
    }));
    const result = computeBenchmarkMetrics(makeData({ pullRequests: prs }));
    const prCycle = result.comparisons.find((c) => c.id === 'pr-cycle-time');
    expect(prCycle?.verdict).toBe('comparable');
    expect(prCycle?.ratio).not.toBeNull();
  });

  it('includes proposal-to-ship comparison', () => {
    const result = computeBenchmarkMetrics(makeData());
    const leadTime = result.comparisons.find(
      (c) => c.id === 'proposal-to-ship'
    );
    expect(leadTime).toBeDefined();
    expect(leadTime?.metric).toBe('Proposal-to-Ship Lead Time');
  });

  it('includes throughput-per-contributor comparison', () => {
    const result = computeBenchmarkMetrics(makeData());
    const throughput = result.comparisons.find(
      (c) => c.id === 'weekly-throughput-per-contributor'
    );
    expect(throughput).toBeDefined();
    expect(throughput?.unit).toBe('PRs/contributor');
  });

  it('sets unknown throughput verdict when no contributors', () => {
    const result = computeBenchmarkMetrics(makeData({ agentStats: [] }));
    const throughput = result.comparisons.find(
      (c) => c.id === 'weekly-throughput-per-contributor'
    );
    expect(throughput?.verdict).toBe('unknown');
  });

  it('returns correct mergedPrCount and implementedProposalCount', () => {
    const now = '2026-02-20T12:00:00Z';
    const prs = [
      {
        number: 1,
        title: 'A',
        state: 'merged' as const,
        author: 'a',
        createdAt: now,
        mergedAt: now,
        closedAt: now,
      },
      {
        number: 2,
        title: 'B',
        state: 'open' as const,
        author: 'a',
        createdAt: now,
      },
    ];
    const proposals = [
      {
        number: 10,
        title: 'P1',
        phase: 'implemented' as const,
        author: 'a',
        createdAt: now,
        commentCount: 0,
      },
      {
        number: 11,
        title: 'P2',
        phase: 'discussion' as const,
        author: 'a',
        createdAt: now,
        commentCount: 0,
      },
    ];
    const result = computeBenchmarkMetrics(
      makeData({ pullRequests: prs, proposals })
    );
    expect(result.mergedPrCount).toBe(1);
    expect(result.implementedProposalCount).toBe(1);
  });

  it('data note warns about small sample size', () => {
    const result = computeBenchmarkMetrics(makeData());
    expect(result.dataNote).toContain('0 merged PR');
  });
});
