import { describe, it, expect } from 'vitest';
import type { ActivityData, PullRequest, Proposal } from '../types/activity';
import { computeVelocityMetrics } from './velocity';

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    state: 'open',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-12T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    comments: [],
    proposals: [],
    ...overrides,
  };
}

describe('computeVelocityMetrics', () => {
  it('returns null metrics for empty data', () => {
    const result = computeVelocityMetrics(makeData());
    expect(result.medianPrCycleHours).toBeNull();
    expect(result.medianApprovalToMergeHours).toBeNull();
    expect(result.medianProposalToShipHours).toBeNull();
    expect(result.openPrCount).toBe(0);
    expect(result.weeklyMergedCount).toBe(0);
    expect(result.previousWeekMergedCount).toBe(0);
    expect(result.governanceOverheadRatio).toBeNull();
    expect(result.weeklyMergeSeries).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('computes median PR cycle time from merged PRs', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T12:00:00Z', // 12 hours
      }),
      makePR({
        number: 2,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-11T00:00:00Z', // 24 hours
      }),
      makePR({
        number: 3,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-12T12:00:00Z', // 60 hours
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.medianPrCycleHours).toBe(24); // median of [12, 24, 60]
  });

  it('computes median approval-to-merge hours from firstApprovalAt', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        firstApprovalAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T12:00:00Z', // 12 hours after approval
      }),
      makePR({
        number: 2,
        state: 'merged',
        firstApprovalAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-11T00:00:00Z', // 24 hours after approval
      }),
      makePR({
        number: 3,
        state: 'merged',
        firstApprovalAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-12T12:00:00Z', // 60 hours after approval
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.medianApprovalToMergeHours).toBe(24); // median of [12, 24, 60]
  });

  it('returns null approval-to-merge when no firstApprovalAt data exists', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T12:00:00Z',
        // no firstApprovalAt
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.medianApprovalToMergeHours).toBeNull();
  });

  it('ignores open and closed-but-not-merged PRs for cycle time', () => {
    const prs = [
      makePR({ number: 1, state: 'open' }),
      makePR({ number: 2, state: 'closed' }),
      makePR({
        number: 3,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T06:00:00Z', // 6 hours
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.medianPrCycleHours).toBe(6);
  });

  it('counts open PRs', () => {
    const prs = [
      makePR({ number: 1, state: 'open' }),
      makePR({ number: 2, state: 'open' }),
      makePR({ number: 3, state: 'merged', mergedAt: '2026-02-10T00:00:00Z' }),
      makePR({ number: 4, state: 'closed' }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.openPrCount).toBe(2);
  });

  it('counts PRs merged in current vs previous week', () => {
    // generatedAt is 2026-02-12T12:00:00Z
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        mergedAt: '2026-02-11T00:00:00Z', // within current week
      }),
      makePR({
        number: 2,
        state: 'merged',
        mergedAt: '2026-02-10T00:00:00Z', // within current week
      }),
      makePR({
        number: 3,
        state: 'merged',
        mergedAt: '2026-02-06T00:00:00Z', // within current week (just inside)
      }),
      makePR({
        number: 4,
        state: 'merged',
        mergedAt: '2026-02-04T00:00:00Z', // previous week
      }),
      makePR({
        number: 5,
        state: 'merged',
        mergedAt: '2026-01-20T00:00:00Z', // older
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.weeklyMergedCount).toBe(3);
    expect(result.previousWeekMergedCount).toBe(1);
  });

  it('computes median proposal-to-ship time', () => {
    const proposals = [
      makeProposal({
        number: 1,
        phase: 'implemented',
        createdAt: '2026-02-01T00:00:00Z',
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-01T00:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-01T06:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-01T12:00:00Z' },
          { phase: 'implemented', enteredAt: '2026-02-02T00:00:00Z' }, // 24h total
        ],
      }),
      makeProposal({
        number: 2,
        phase: 'implemented',
        createdAt: '2026-02-03T00:00:00Z',
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-03T00:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-03T12:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-04T00:00:00Z' },
          { phase: 'implemented', enteredAt: '2026-02-05T00:00:00Z' }, // 48h total
        ],
      }),
    ];
    const result = computeVelocityMetrics(makeData({ proposals }));
    expect(result.medianProposalToShipHours).toBe(36); // median of [24, 48]
  });

  it('ignores non-implemented proposals for ship time', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'discussion' }),
      makeProposal({ number: 2, phase: 'voting' }),
      makeProposal({ number: 3, phase: 'rejected' }),
    ];
    const result = computeVelocityMetrics(makeData({ proposals }));
    expect(result.medianProposalToShipHours).toBeNull();
  });

  it('computes governance overhead ratio', () => {
    const proposals = [
      makeProposal({
        number: 1,
        phase: 'implemented',
        createdAt: '2026-02-01T00:00:00Z',
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-01T00:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-01T06:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-01T12:00:00Z' }, // 12h governance
          { phase: 'implemented', enteredAt: '2026-02-02T00:00:00Z' }, // 24h total
        ],
      }),
    ];
    const result = computeVelocityMetrics(makeData({ proposals }));
    // governance overhead = 12h / 24h = 0.5
    expect(result.governanceOverheadRatio).toBe(0.5);
  });

  it('returns null governance overhead when no proposals have full transitions', () => {
    const proposals = [
      makeProposal({
        number: 1,
        phase: 'implemented',
        createdAt: '2026-02-01T00:00:00Z',
        // No phaseTransitions
      }),
    ];
    const result = computeVelocityMetrics(makeData({ proposals }));
    expect(result.governanceOverheadRatio).toBeNull();
  });

  it('builds weekly merge sparkline series', () => {
    // generatedAt is 2026-02-12T12:00:00Z
    // Week 0 (current): Feb 5-12
    // Week 1 (previous): Jan 29-Feb 5
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        mergedAt: '2026-02-11T00:00:00Z', // week 0
      }),
      makePR({
        number: 2,
        state: 'merged',
        mergedAt: '2026-02-10T00:00:00Z', // week 0
      }),
      makePR({
        number: 3,
        state: 'merged',
        mergedAt: '2026-02-03T00:00:00Z', // week 1
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    // 8-week series, oldest first
    expect(result.weeklyMergeSeries.length).toBe(8);
    expect(result.weeklyMergeSeries[7]).toBe(2); // current week
    expect(result.weeklyMergeSeries[6]).toBe(1); // previous week
    expect(result.weeklyMergeSeries.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('handles even number of values for median correctly', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T10:00:00Z', // 10 hours
      }),
      makePR({
        number: 2,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T20:00:00Z', // 20 hours
      }),
    ];
    const result = computeVelocityMetrics(makeData({ pullRequests: prs }));
    expect(result.medianPrCycleHours).toBe(15); // average of [10, 20]
  });
});
