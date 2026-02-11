import { describe, expect, it } from 'vitest';
import { computeGovernanceOps } from '../governance-ops';
import type { ActivityData, Proposal } from '../types';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Proposal',
    phase: 'discussion',
    author: 'hivemoot-worker',
    createdAt: '2026-02-08T00:00:00Z',
    commentCount: 2,
    ...overrides,
  };
}

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-10T00:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 1,
      forks: 1,
      openIssues: 1,
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

describe('computeGovernanceOps', () => {
  it('computes five SLOs and active incidents with taxonomy', () => {
    const data = makeActivityData({
      externalVisibility: {
        status: 'red',
        score: 55,
        checks: [],
        blockers: ['Repository topics configured'],
      },
      proposals: [
        makeProposal({
          number: 10,
          phase: 'implemented',
          createdAt: '2026-02-08T00:00:00Z',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-08T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-09T00:00:00Z' },
            { phase: 'implemented', enteredAt: '2026-02-09T12:00:00Z' },
          ],
        }),
        makeProposal({
          number: 11,
          phase: 'ready-to-implement',
          createdAt: '2026-02-09T00:00:00Z',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-09T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-09T12:00:00Z' },
          ],
        }),
      ],
      pullRequests: [
        {
          number: 200,
          title: 'Implements issue 10',
          state: 'merged',
          author: 'hivemoot-builder',
          createdAt: '2026-02-09T06:00:00Z',
          mergedAt: '2026-02-09T12:00:00Z',
          body: 'Fixes #10',
        },
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 11,
          type: 'issue',
          author: 'hivemoot-worker',
          body: 'BLOCKED: admin-required',
          createdAt: '2026-02-10T00:00:00Z',
          url: 'https://github.com/hivemoot/colony/issues/11#issuecomment-1',
        },
        {
          id: 2,
          issueOrPrNumber: 11,
          type: 'issue',
          author: 'hivemoot-worker',
          body: 'VERIFIED: admin applied the fix',
          createdAt: '2026-02-10T02:00:00Z',
          url: 'https://github.com/hivemoot/colony/issues/11#issuecomment-2',
        },
        {
          id: 3,
          issueOrPrNumber: 200,
          type: 'pr',
          author: 'hivemoot-scout',
          body: 'BLOCKED: merge-required',
          createdAt: '2026-02-10T03:00:00Z',
          url: 'https://github.com/hivemoot/colony/pull/200#issuecomment-3',
        },
      ],
    });

    const ops = computeGovernanceOps(data, '2026-02-11T12:00:00Z');

    expect(ops.slos).toHaveLength(5);
    expect(ops.status).toBe('red');

    expect(
      ops.slos.find((slo) => slo.id === 'proposal-cycle-time')?.status
    ).toBe('healthy');
    expect(
      ops.slos.find((slo) => slo.id === 'implementation-lead-time')?.status
    ).toBe('healthy');
    expect(
      ops.slos.find((slo) => slo.id === 'blocked-ready-work')?.status
    ).toBe('breach');
    expect(
      ops.slos.find((slo) => slo.id === 'dashboard-freshness')?.status
    ).toBe('at-risk');
    expect(
      ops.slos.find((slo) => slo.id === 'discoverability-health')?.status
    ).toBe('breach');

    expect(ops.incidents).toHaveLength(1);
    expect(ops.incidents[0].class).toBe('maintainer-gate');
    expect(ops.incidents[0].severity).toBe('high');
    expect(ops.incidents[0].sourceType).toBe('pr');
    expect(ops.incidents[0].sourceNumber).toBe(200);
  });

  it('returns healthy status when all SLOs are healthy and no incidents are active', () => {
    const data = makeActivityData({
      generatedAt: '2026-02-11T11:00:00Z',
      externalVisibility: {
        status: 'green',
        score: 90,
        checks: [],
        blockers: [],
      },
      proposals: [
        makeProposal({
          number: 20,
          phase: 'implemented',
          createdAt: '2026-02-10T00:00:00Z',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-10T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-10T12:00:00Z' },
            { phase: 'implemented', enteredAt: '2026-02-10T18:00:00Z' },
          ],
        }),
      ],
      pullRequests: [
        {
          number: 300,
          title: 'Implements issue 20',
          state: 'merged',
          author: 'hivemoot-worker',
          createdAt: '2026-02-10T13:00:00Z',
          mergedAt: '2026-02-10T18:00:00Z',
          body: 'Resolves #20',
        },
      ],
    });

    const ops = computeGovernanceOps(data, '2026-02-11T12:00:00Z');
    expect(ops.status).toBe('green');
    expect(ops.slos.every((slo) => slo.status === 'healthy')).toBe(true);
    expect(ops.incidents).toEqual([]);
    expect(ops.reliabilityBudget.remaining).toBe(100);
  });

  it('keeps proposal-to-PR linkage repo-scoped when issue numbers collide', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 42,
          repo: 'hivemoot/colony',
          phase: 'ready-to-implement',
          createdAt: '2026-02-08T00:00:00Z',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-08T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-09T00:00:00Z' },
          ],
        }),
        makeProposal({
          number: 42,
          repo: 'hivemoot/hivemoot',
          phase: 'ready-to-implement',
          createdAt: '2026-02-08T00:00:00Z',
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-08T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-09T00:00:00Z' },
          ],
        }),
      ],
      pullRequests: [
        {
          number: 501,
          title: 'Implements colony #42',
          state: 'merged',
          author: 'hivemoot-worker',
          createdAt: '2026-02-09T06:00:00Z',
          mergedAt: '2026-02-09T12:00:00Z',
          body: 'Fixes #42',
          repo: 'hivemoot/colony',
        },
      ],
    });

    const ops = computeGovernanceOps(data, '2026-02-11T12:00:00Z');

    const leadTime = ops.slos.find(
      (slo) => slo.id === 'implementation-lead-time'
    );
    const blockedReady = ops.slos.find(
      (slo) => slo.id === 'blocked-ready-work'
    );

    expect(leadTime?.details).toBe('1 ready-to-merge cycle measured.');
    expect(blockedReady?.current).toBe('1/2 blocked (50%)');
    expect(blockedReady?.status).toBe('breach');
  });

  it('does not deduplicate incidents across repos when issue numbers collide', () => {
    const data = makeActivityData({
      comments: [
        {
          id: 10,
          issueOrPrNumber: 77,
          type: 'issue',
          author: 'hivemoot-worker',
          body: 'BLOCKED: admin-required',
          createdAt: '2026-02-10T00:00:00Z',
          url: 'https://github.com/hivemoot/colony/issues/77#issuecomment-10',
          repo: 'hivemoot/colony',
        },
        {
          id: 11,
          issueOrPrNumber: 77,
          type: 'issue',
          author: 'hivemoot-builder',
          body: 'BLOCKED: admin-required',
          createdAt: '2026-02-10T01:00:00Z',
          url: 'https://github.com/hivemoot/hivemoot/issues/77#issuecomment-11',
          repo: 'hivemoot/hivemoot',
        },
      ],
    });

    const ops = computeGovernanceOps(data, '2026-02-11T12:00:00Z');

    expect(ops.incidents).toHaveLength(2);
    expect(new Set(ops.incidents.map((incident) => incident.id)).size).toBe(2);
  });
});
